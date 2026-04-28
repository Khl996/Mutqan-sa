<#
.SYNOPSIS
    Verifies reject_work_order intermediate branch coverage.

.DESCRIPTION
    Covers reject_work_order from:
      - pending_supervisor_approval by supervisor
      - pending_engineer_review by dedicated engineer
      - pending_reporter_closure by original reporter

    Also verifies empty reason denial, cross-tenant denial, stage-specific wrong-role
    denials, status rollback to in_progress, and operation log type/message.

    This script CONSUMES the three reject branch fixture work orders. Re-run:
      npm run prepare:staging-fixtures
#>

$ErrorActionPreference = "Stop"

function Import-DotEnvFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
        $parts = $line.Split("=", 2)
        $name  = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        if ($name -and -not [Environment]::GetEnvironmentVariable($name)) {
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

function Get-EnvAny {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
    }
    return $null
}

function Get-RequiredEnv {
    param([string]$DisplayName, [string[]]$Names)
    $value = Get-EnvAny -Names $Names
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required env var: $DisplayName (tried: $($Names -join ', '))"
    }
    return $value
}

$script:results = New-Object System.Collections.Generic.List[object]
function Add-Result {
    param([string]$Name, [string]$Status, [string]$Evidence = "")
    $script:results.Add([pscustomobject]@{ Status = $Status; Name = $Name; Evidence = $Evidence }) | Out-Null
    $tag = switch ($Status) { "PASS" { "[PASS]" } "FAIL" { "[FAIL]" } default { "[----]" } }
    Write-Host "  $tag  $Name"
    if ($Status -ne "PASS" -and -not [string]::IsNullOrWhiteSpace($Evidence)) {
        Write-Host "         $Evidence"
    }
}

function Test-JwtExpired {
    param([string]$Token)
    try {
        $raw = $Token.Split(".")[1]
        $rem = $raw.Length % 4
        if ($rem -ne 0) { $raw += "=" * (4 - $rem) }
        $raw = $raw.Replace("-", "+").Replace("_", "/")
        $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw))
        $obj = $json | ConvertFrom-Json
        return ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge $obj.exp)
    } catch {
        return $true
    }
}

function Invoke-TableGet {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken)
    $h = @{ "apikey" = $ApiKey; "Authorization" = "Bearer $BearerToken"; "Accept" = "application/json" }
    try {
        $body = Invoke-RestMethod -Method Get -Uri $Uri -Headers $h -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 200; Body = $body; Error = $null }
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return @{ Ok = $false; StatusCode = $code; Body = $null; Error = $msg }
    }
}

function Invoke-Rpc {
    param([string]$BaseUrl, [string]$ApiKey, [string]$BearerToken, [string]$FunctionName, [hashtable]$Body)
    $h = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
    }
    try {
        $resp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/rest/v1/rpc/$FunctionName" -Headers $h -Body ($Body | ConvertTo-Json -Compress -Depth 5) -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 200; Body = $resp; Error = $null }
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return @{ Ok = $false; StatusCode = $code; Body = $null; Error = $msg }
    }
}

function Get-RowCount {
    param($Body)
    if ($null -eq $Body) { return 0 }
    if ($Body -is [System.Array]) { return $Body.Count }
    return 1
}

function Get-WoStatus {
    param([string]$WoId)
    $r = Invoke-TableGet -Uri "$supaUrl/rest/v1/work_orders?id=eq.$WoId&select=status" -ApiKey $svcKey -BearerToken $svcKey
    if (-not $r.Ok -or (Get-RowCount $r.Body) -lt 1) { return $null }
    $row = if ($r.Body -is [System.Array]) { $r.Body[0] } else { $r.Body }
    return $row.status
}

function Get-RejectLog {
    param([string]$WoId, [string]$Reason)
    $r = Invoke-TableGet -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=eq.$WoId&select=id,type,description,timestamp&order=timestamp.desc" -ApiKey $svcKey -BearerToken $svcKey
    if (-not $r.Ok -or (Get-RowCount $r.Body) -lt 1) { return $null }
    $rows = if ($r.Body -is [System.Array]) { $r.Body } else { @($r.Body) }
    return $rows | Where-Object {
        $_.type -eq "maintenance" -and $_.description -eq "Workflow rejected/returned. Reason: $Reason"
    } | Select-Object -First 1
}

function Get-OpLogCount {
    param([string]$WoId)
    $r = Invoke-TableGet -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=eq.$WoId&select=id" -ApiKey $svcKey -BearerToken $svcKey
    if (-not $r.Ok) { return -1 }
    return Get-RowCount $r.Body
}

function Cap {
    param([string]$Str, [int]$Max = 120)
    if ([string]::IsNullOrEmpty($Str)) { return "" }
    if ($Str.Length -le $Max) { return $Str }
    return $Str.Substring(0, $Max) + "..."
}

function Assert-Denied {
    param([string]$Name, [hashtable]$Result)
    if (-not $Result.Ok) {
        Add-Result $Name "PASS" "HTTP $($Result.StatusCode)"
    } else {
        Add-Result $Name "FAIL" "RPC succeeded unexpectedly"
    }
}

function Test-RejectBranch {
    param(
        [string]$Label,
        [string]$WoId,
        [string]$ExpectedInitialStatus,
        [string]$AllowedActorName,
        [string]$AllowedJwt,
        [string]$WrongActorName,
        [string]$WrongJwt
    )

    Write-Host ""
    Write-Host "--- $Label -------------------------------------------"
    $initial = Get-WoStatus -WoId $WoId
    if ($initial -ne $ExpectedInitialStatus) {
        Add-Result "$Label fixture starts in $ExpectedInitialStatus" "FAIL" "got '$initial'; re-run prepare:staging-fixtures"
        return
    }
    Add-Result "$Label fixture starts in $ExpectedInitialStatus" "PASS" "status=$initial"

    $wrong = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $WrongJwt -FunctionName "reject_work_order" -Body @{
        p_work_order_id = $WoId
        p_reason = "$WrongActorName wrong-role branch attempt"
    }
    Assert-Denied "$Label wrong role denied ($WrongActorName)" $wrong

    $reason = "$Label branch rejection verification"
    $logsBefore = Get-OpLogCount -WoId $WoId
    $ok = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $AllowedJwt -FunctionName "reject_work_order" -Body @{
        p_work_order_id = $WoId
        p_reason = $reason
    }
    if ($ok.Ok) {
        Add-Result "$Label reject_work_order succeeds ($AllowedActorName)" "PASS" ""
    } else {
        Add-Result "$Label reject_work_order succeeds ($AllowedActorName)" "FAIL" "HTTP $($ok.StatusCode): $(Cap $ok.Error)"
    }

    $status = Get-WoStatus -WoId $WoId
    if ($status -eq "in_progress") {
        Add-Result "$Label returns to in_progress" "PASS" "status=$status"
    } else {
        Add-Result "$Label returns to in_progress" "FAIL" "status=$status"
    }

    $logsAfter = Get-OpLogCount -WoId $WoId
    $log = Get-RejectLog -WoId $WoId -Reason $reason
    if ($logsAfter -gt $logsBefore -and $null -ne $log) {
        Add-Result "$Label writes maintenance operation log with rejection message" "PASS" "count $logsBefore => $logsAfter"
    } else {
        Add-Result "$Label writes maintenance operation log with rejection message" "FAIL" "count $logsBefore => $logsAfter"
    }
}

Import-DotEnvFile -Path ".env.staging-fixtures.local"
Import-DotEnvFile -Path ".env.local"

$supaUrl = (Get-RequiredEnv "Supabase URL" @("SUPABASE_URL", "VITE_SUPABASE_URL")).TrimEnd("/")
$anonKey = Get-RequiredEnv "Supabase anon key" @("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
$svcKey = Get-RequiredEnv "Service role key" @("SUPABASE_SERVICE_ROLE_KEY")
$supervisorWoId = Get-RequiredEnv "Reject supervisor WO id" @("RLS_REJECT_SUPERVISOR_WO_ID")
$engineerWoId = Get-RequiredEnv "Reject engineer WO id" @("RLS_REJECT_ENGINEER_WO_ID")
$reporterWoId = Get-RequiredEnv "Reject reporter WO id" @("RLS_REJECT_REPORTER_WO_ID")
$techJwt = Get-RequiredEnv "Technician JWT" @("RLS_TENANT_A_TECHNICIAN_JWT")
$reporterJwt = Get-RequiredEnv "Reporter JWT" @("RLS_TENANT_A_REPORTER_JWT")
$supervisorJwt = Get-RequiredEnv "Supervisor JWT" @("RLS_TENANT_A_SUPERVISOR_JWT")
$engineerJwt = Get-RequiredEnv "Engineer JWT" @("RLS_TENANT_A_ENGINEER_JWT")
$tenantBJwt = Get-RequiredEnv "Tenant B JWT" @("RLS_TENANT_B_USER_JWT")

Write-Host ""
Write-Host "=============================================================="
Write-Host "  Mutqan reject_work_order Branch Verification"
Write-Host "=============================================================="
Write-Host "  Supabase      : $supaUrl"
Write-Host "  Supervisor WO : $supervisorWoId"
Write-Host "  Engineer WO   : $engineerWoId"
Write-Host "  Reporter WO   : $reporterWoId"
Write-Host ""

Write-Host "--- JWT freshness -------------------------------------------"
$expiredAny = $false
foreach ($j in @(
    @{ Name = "technician"; Token = $techJwt },
    @{ Name = "reporter"; Token = $reporterJwt },
    @{ Name = "supervisor"; Token = $supervisorJwt },
    @{ Name = "engineer"; Token = $engineerJwt },
    @{ Name = "tenant_b"; Token = $tenantBJwt }
)) {
    if (Test-JwtExpired -Token $j.Token) {
        Write-Host "  [STALE]  $($j.Name) JWT is expired"
        $expiredAny = $true
    } else {
        Write-Host "  [fresh]  $($j.Name) JWT"
    }
}
if ($expiredAny) {
    Write-Host ""
    Write-Host "  One or more JWTs are expired. Re-run:"
    Write-Host "    npm run prepare:staging-fixtures"
    exit 1
}

Write-Host ""
Write-Host "--- Shared negative tests -----------------------------------"
$empty = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $supervisorJwt -FunctionName "reject_work_order" -Body @{
    p_work_order_id = $supervisorWoId
    p_reason = ""
}
Assert-Denied "empty reason denied" $empty

$crossTenant = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $tenantBJwt -FunctionName "reject_work_order" -Body @{
    p_work_order_id = $supervisorWoId
    p_reason = "cross-tenant branch attempt"
}
Assert-Denied "wrong tenant denied" $crossTenant

Test-RejectBranch `
    -Label "pending_supervisor_approval" `
    -WoId $supervisorWoId `
    -ExpectedInitialStatus "pending_supervisor_approval" `
    -AllowedActorName "supervisor" `
    -AllowedJwt $supervisorJwt `
    -WrongActorName "technician" `
    -WrongJwt $techJwt

Test-RejectBranch `
    -Label "pending_engineer_review" `
    -WoId $engineerWoId `
    -ExpectedInitialStatus "pending_engineer_review" `
    -AllowedActorName "dedicated engineer" `
    -AllowedJwt $engineerJwt `
    -WrongActorName "reporter" `
    -WrongJwt $reporterJwt

Test-RejectBranch `
    -Label "pending_reporter_closure" `
    -WoId $reporterWoId `
    -ExpectedInitialStatus "pending_reporter_closure" `
    -AllowedActorName "original reporter" `
    -AllowedJwt $reporterJwt `
    -WrongActorName "technician" `
    -WrongJwt $techJwt

Write-Host ""
Write-Host "=============================================================="
Write-Host "  Results"
Write-Host "=============================================================="
$script:results | Format-Table -Property Status, Name, Evidence -AutoSize -Wrap

$nPass = ($script:results | Where-Object { $_.Status -eq "PASS" }).Count
$nFail = ($script:results | Where-Object { $_.Status -eq "FAIL" }).Count
Write-Host "  PASS: $nPass   FAIL: $nFail"
Write-Host ""

if ($nFail -gt 0) {
    Write-Error "reject_work_order branch verification FAILED ($nFail failure(s))"
    exit 1
}

Write-Host "  reject_work_order branch verification PASSED"
