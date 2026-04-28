<#
.SYNOPSIS
    Verifies audited work-order assignment through assign_work_order.

.DESCRIPTION
    Requires prepared staging fixtures and these env vars:
      VITE_SUPABASE_URL or SUPABASE_URL
      VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
      SUPABASE_SERVICE_ROLE_KEY
      RLS_TENANT_A_MANAGER_JWT
      RLS_TENANT_A_REPORTER_JWT
      RLS_TENANT_A_TECHNICIAN_JWT
      RLS_TENANT_B_USER_JWT
      RLS_TENANT_A_TECHNICIAN_USER_ID
      RLS_TENANT_A_INACTIVE_TECHNICIAN_USER_ID
      RLS_TENANT_B_USER_ID
      RLS_TENANT_A_TEAM_ID
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
$script:anyFail = $false
$script:createdWorkOrderIds = New-Object System.Collections.Generic.List[string]

function Add-Result {
    param([string]$Name, [string]$Status, [string]$Evidence = "")
    $script:results.Add([pscustomobject]@{ Status = $Status; Name = $Name; Evidence = $Evidence }) | Out-Null
    if ($Status -eq "FAIL") { $script:anyFail = $true }
    $tag = switch ($Status) { "PASS" { "[PASS]" } "FAIL" { "[FAIL]" } "SKIP" { "[SKIP]" } default { "[----]" } }
    Write-Host "  $tag  $Name"
    if ($Status -ne "PASS" -and -not [string]::IsNullOrWhiteSpace($Evidence)) {
        Write-Host "         $Evidence"
    }
}

function Invoke-Rpc {
    param([string]$BaseUrl, [string]$ApiKey, [string]$BearerToken, [string]$FunctionName, [object]$Body)
    $headers = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
    }
    try {
        $json = $Body | ConvertTo-Json -Depth 20
        $response = Invoke-RestMethod -Method Post -Uri "$BaseUrl/rest/v1/rpc/$FunctionName" -Headers $headers -Body $json -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 200; Body = $response; Error = $null }
    } catch {
        $statusCode = 0
        $errorBody = $_.Exception.Message
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $bodyText = $reader.ReadToEnd()
                    if (-not [string]::IsNullOrWhiteSpace($bodyText)) { $errorBody = $bodyText }
                }
            } catch {
                $errorBody = $_.Exception.Message
            }
        }
        return @{ Ok = $false; StatusCode = $statusCode; Body = $null; Error = $errorBody }
    }
}

function Invoke-TableGet {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken)
    $headers = @{ "apikey" = $ApiKey; "Authorization" = "Bearer $BearerToken"; "Accept" = "application/json" }
    try {
        $body = Invoke-RestMethod -Method Get -Uri $Uri -Headers $headers -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 200; Body = $body; Error = $null }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $statusCode = [int]$_.Exception.Response.StatusCode }
        return @{ Ok = $false; StatusCode = $statusCode; Body = $null; Error = $_.Exception.Message }
    }
}

function Invoke-TablePost {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken, [object]$Body)
    $headers = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
        "Prefer"        = "return=representation"
    }
    try {
        $json = $Body | ConvertTo-Json -Depth 20
        $response = Invoke-RestMethod -Method Post -Uri $Uri -Headers $headers -Body $json -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 201; Body = $response; Error = $null }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $statusCode = [int]$_.Exception.Response.StatusCode }
        return @{ Ok = $false; StatusCode = $statusCode; Body = $null; Error = $_.Exception.Message }
    }
}

function Invoke-TablePatch {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken, [object]$Body)
    $headers = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
    }
    try {
        $json = $Body | ConvertTo-Json -Depth 20
        Invoke-RestMethod -Method Patch -Uri $Uri -Headers $headers -Body $json -TimeoutSec 30 | Out-Null
        return @{ Ok = $true; StatusCode = 204; Error = $null }
    } catch {
        $statusCode = 0
        $errorBody = $_.Exception.Message
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $statusCode = [int]$_.Exception.Response.StatusCode }
        return @{ Ok = $false; StatusCode = $statusCode; Error = $errorBody }
    }
}

function Invoke-TableDelete {
    param([string]$Uri, [string]$ApiKey)
    $headers = @{ "apikey" = $ApiKey; "Authorization" = "Bearer $ApiKey"; "Accept" = "application/json" }
    try {
        Invoke-RestMethod -Method Delete -Uri $Uri -Headers $headers -TimeoutSec 30 | Out-Null
    } catch {
        Write-Host "Cleanup warning: $($_.Exception.Message)"
    }
}

function Test-MissingAssignRpc {
    param([hashtable]$Result)
    return (-not $Result.Ok) -and $Result.StatusCode -eq 404 -and (($Result.Error | Out-String) -like "*assign_work_order*")
}

function Test-ExpectedDeny {
    param([hashtable]$Result)
    return (-not $Result.Ok) -and -not (Test-MissingAssignRpc -Result $Result)
}

function New-PendingWorkOrder {
    param([string]$Code, [string]$Title)
    $result = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "create_work_order" -Body @{
        p_work_order = @{
            code        = $Code
            title       = $Title
            description = "Created by verify-workorder-assignment.ps1"
            priority    = "medium"
            assigned_team = $teamAId
            building_id = $assetA.Body[0].building_id
            asset_id    = $assetA.Body[0].id
        }
    }
    if (-not $result.Ok -or -not $result.Body.id) {
        throw "Could not create pending work order $Code. HTTP $($result.StatusCode): $($result.Error)"
    }
    $script:createdWorkOrderIds.Add($result.Body.id) | Out-Null
    return $result.Body.id
}

Import-DotEnvFile ".env.staging-fixtures.local"
Import-DotEnvFile ".env.local"

$supaUrl         = (Get-RequiredEnv "Supabase URL" @("VITE_SUPABASE_URL", "SUPABASE_URL")).TrimEnd("/")
$anonKey         = Get-RequiredEnv "Supabase anon key" @("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY")
$svcKey          = Get-RequiredEnv "Supabase service key" @("SUPABASE_SERVICE_ROLE_KEY")
$managerJwt      = Get-RequiredEnv "Tenant A manager JWT" @("RLS_TENANT_A_MANAGER_JWT")
$reporterJwt     = Get-RequiredEnv "Tenant A reporter JWT" @("RLS_TENANT_A_REPORTER_JWT")
$techJwt         = Get-RequiredEnv "Tenant A technician JWT" @("RLS_TENANT_A_TECHNICIAN_JWT")
$tenantBJwt      = Get-RequiredEnv "Tenant B user JWT" @("RLS_TENANT_B_USER_JWT")
$tenantAId       = Get-RequiredEnv "Tenant A id" @("RLS_TENANT_A_ID")
$technicianId    = Get-RequiredEnv "Tenant A technician user id" @("RLS_TENANT_A_TECHNICIAN_USER_ID")
$inactiveTechId  = Get-RequiredEnv "Tenant A inactive technician user id" @("RLS_TENANT_A_INACTIVE_TECHNICIAN_USER_ID")
$tenantBUserId   = Get-RequiredEnv "Tenant B user id" @("RLS_TENANT_B_USER_ID")
$teamAId         = Get-RequiredEnv "Tenant A team id" @("RLS_TENANT_A_TEAM_ID")

Write-Host "--- assign_work_order audited assignment -------------------"

$assetA = Invoke-TableGet -Uri "$supaUrl/rest/v1/assets?code=eq.FX-A-AHU-01&select=id,tenant_id,building_id&limit=1" -ApiKey $svcKey -BearerToken $svcKey
if (-not $assetA.Ok -or $assetA.Body.Count -eq 0) {
    throw "Fixture asset not found. Run npm run prepare:staging-fixtures first."
}

$suffix = Get-Date -Format "yyMMddHHmmss"
$woAssign = New-PendingWorkOrder -Code "FX-ASGN-$suffix" -Title "Assignment RPC smoke test"

$r1 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "assign_work_order" -Body @{
    p_work_order_id = $woAssign
    p_assigned_to = $technicianId
    p_assigned_team = $teamAId
}
if ($r1.Ok -and $r1.Body.status -eq "assigned" -and $r1.Body.assigned_to -eq $technicianId) {
    Add-Result "maintenance_manager can assign pending WO to same-tenant technician" "PASS" "id=$woAssign"
} else {
    Add-Result "maintenance_manager can assign pending WO to same-tenant technician" "FAIL" "HTTP $($r1.StatusCode): $($r1.Error)"
}

$woRow = Invoke-TableGet -Uri "$supaUrl/rest/v1/work_orders?id=eq.$woAssign&select=id,status,assigned_to,assigned_team" -ApiKey $svcKey -BearerToken $svcKey
if ($woRow.Ok -and $woRow.Body.Count -eq 1 -and $woRow.Body[0].status -eq "assigned") {
    Add-Result "assignment changes status pending to assigned" "PASS" "status=$($woRow.Body[0].status)"
} else {
    Add-Result "assignment changes status pending to assigned" "FAIL" "Unexpected work order state"
}

$log = Invoke-TableGet -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=eq.$woAssign&type=eq.assignment&select=id,description,reason,team_id" -ApiKey $svcKey -BearerToken $svcKey
if ($log.Ok -and $log.Body.Count -ge 1) {
    Add-Result "assignment writes operation log" "PASS" "log_id=$($log.Body[0].id)"
} else {
    Add-Result "assignment writes operation log" "FAIL" "No assignment log found"
}

$woCross = New-PendingWorkOrder -Code "FX-ASGN-XTEN-$suffix" -Title "Cross tenant assignee denial"
$cross = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "assign_work_order" -Body @{
    p_work_order_id = $woCross
    p_assigned_to = $tenantBUserId
}
if (Test-ExpectedDeny -Result $cross) {
    Add-Result "cross-tenant assignee denied" "PASS" "HTTP $($cross.StatusCode)"
} else {
    Add-Result "cross-tenant assignee denied" "FAIL" "HTTP $($cross.StatusCode): $($cross.Error)"
}

$inactive = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "assign_work_order" -Body @{
    p_work_order_id = $woCross
    p_assigned_to = $inactiveTechId
}
if (Test-ExpectedDeny -Result $inactive) {
    Add-Result "inactive assignee denied" "PASS" "HTTP $($inactive.StatusCode)"
} else {
    Add-Result "inactive assignee denied" "FAIL" "HTTP $($inactive.StatusCode): $($inactive.Error)"
}

$reporterDenied = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "assign_work_order" -Body @{
    p_work_order_id = $woCross
    p_assigned_to = $technicianId
}
if (Test-ExpectedDeny -Result $reporterDenied) {
    Add-Result "unauthorized reporter denied assignment" "PASS" "HTTP $($reporterDenied.StatusCode)"
} else {
    Add-Result "unauthorized reporter denied assignment" "FAIL" "HTTP $($reporterDenied.StatusCode): $($reporterDenied.Error)"
}

$techDenied = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "assign_work_order" -Body @{
    p_work_order_id = $woCross
    p_assigned_to = $technicianId
}
if (Test-ExpectedDeny -Result $techDenied) {
    Add-Result "unauthorized technician denied assignment" "PASS" "HTTP $($techDenied.StatusCode)"
} else {
    Add-Result "unauthorized technician denied assignment" "FAIL" "HTTP $($techDenied.StatusCode): $($techDenied.Error)"
}

$initialForReassign = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "assign_work_order" -Body @{
    p_work_order_id = $woCross
    p_assigned_team = $teamAId
}
if (-not $initialForReassign.Ok) {
    Add-Result "reassignment setup assignment" "FAIL" "HTTP $($initialForReassign.StatusCode): $($initialForReassign.Error)"
}

$reassignNoReason = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "assign_work_order" -Body @{
    p_work_order_id = $woCross
    p_assigned_to = $technicianId
}
if (Test-ExpectedDeny -Result $reassignNoReason) {
    Add-Result "reassignment requires reason" "PASS" "HTTP $($reassignNoReason.StatusCode)"
} else {
    Add-Result "reassignment requires reason" "FAIL" "HTTP $($reassignNoReason.StatusCode): $($reassignNoReason.Error)"
}

$start = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "wo_start" -Body @{ p_wo_id = $woAssign }
if ($start.Ok) {
    $afterStart = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "assign_work_order" -Body @{
        p_work_order_id = $woAssign
        p_assigned_to = $technicianId
        p_reason = "Attempt after start"
    }
    if (Test-ExpectedDeny -Result $afterStart) {
        Add-Result "assignment after in_progress denied" "PASS" "HTTP $($afterStart.StatusCode)"
    } else {
        Add-Result "assignment after in_progress denied" "FAIL" "HTTP $($afterStart.StatusCode): $($afterStart.Error)"
    }
} else {
    Add-Result "assignment after in_progress denied" "SKIP" "Could not move WO to in_progress: HTTP $($start.StatusCode): $($start.Error)"
}

$completedCode = "FX-ASGN-COMP-$suffix"
$completed = Invoke-TablePost -Uri "$supaUrl/rest/v1/work_orders" -ApiKey $svcKey -BearerToken $svcKey -Body @{
    tenant_id = $tenantAId
    code = $completedCode
    title = "Completed assignment denial"
    status = "completed"
    priority = "medium"
    reported_by = $technicianId
    assigned_team = $teamAId
    created_by = $technicianId
    building_id = $assetA.Body[0].building_id
    asset_id = $assetA.Body[0].id
}
if ($completed.Ok -and $completed.Body[0].id) {
    $completedId = $completed.Body[0].id
    $script:createdWorkOrderIds.Add($completedId) | Out-Null
    $afterCompleted = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "assign_work_order" -Body @{
        p_work_order_id = $completedId
        p_assigned_to = $technicianId
        p_reason = "Attempt after completion"
    }
    if (Test-ExpectedDeny -Result $afterCompleted) {
        Add-Result "assignment after completed denied" "PASS" "HTTP $($afterCompleted.StatusCode)"
    } else {
        Add-Result "assignment after completed denied" "FAIL" "HTTP $($afterCompleted.StatusCode): $($afterCompleted.Error)"
    }
} else {
    Add-Result "assignment after completed denied" "SKIP" "Could not create completed fixture: $($completed.Error)"
}

$direct = Invoke-TablePatch -Uri "$supaUrl/rest/v1/work_orders?id=eq.$woCross" -ApiKey $svcKey -BearerToken $svcKey -Body @{
    assigned_to = $inactiveTechId
}
if (-not $direct.Ok) {
    Add-Result "direct update of assigned_to remains blocked" "PASS" "HTTP $($direct.StatusCode)"
} else {
    Add-Result "direct update of assigned_to remains blocked" "FAIL" "Direct PATCH succeeded"
}

if ($script:createdWorkOrderIds.Count -gt 0) {
    $ids = ($script:createdWorkOrderIds | ForEach-Object { '"' + $_ + '"' }) -join ","
    Invoke-TableDelete -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=in.($ids)" -ApiKey $svcKey
    Invoke-TableDelete -Uri "$supaUrl/rest/v1/work_orders?id=in.($ids)" -ApiKey $svcKey
}

Write-Host ""
Write-Host "--- Summary ------------------------------------------------"
$script:results | Format-Table -AutoSize

if ($script:anyFail) {
    exit 1
}

exit 0
