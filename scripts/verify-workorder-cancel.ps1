<#
.SYNOPSIS
    Verifies audited work-order cancellation through cancel_work_order.

.DESCRIPTION
    Requires prepared staging fixtures and these env vars:
      VITE_SUPABASE_URL or SUPABASE_URL
      VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
      SUPABASE_SERVICE_ROLE_KEY
      RLS_TENANT_A_ID
      RLS_TENANT_B_ID
      RLS_TENANT_A_MANAGER_JWT
      RLS_TENANT_A_REPORTER_JWT
      RLS_TENANT_A_TECHNICIAN_JWT
      RLS_TENANT_B_USER_JWT
      RLS_TENANT_A_TECHNICIAN_USER_ID
      RLS_TENANT_A_TEAM_ID
      RLS_TENANT_B_TEAM_ID
      RLS_TENANT_B_USER_ID
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

function Invoke-TableDeleteAsUser {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken)
    $headers = @{ "apikey" = $ApiKey; "Authorization" = "Bearer $BearerToken"; "Accept" = "application/json" }
    try {
        Invoke-RestMethod -Method Delete -Uri $Uri -Headers $headers -TimeoutSec 30 | Out-Null
        return @{ Ok = $true; StatusCode = 204; Error = $null }
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
        return @{ Ok = $false; StatusCode = $statusCode; Error = $errorBody }
    }
}

function Test-MissingCancelRpc {
    param([hashtable]$Result)
    return (-not $Result.Ok) -and $Result.StatusCode -eq 404 -and (($Result.Error | Out-String) -like "*cancel_work_order*")
}

function Test-ExpectedDeny {
    param([hashtable]$Result)
    return (-not $Result.Ok) -and -not (Test-MissingCancelRpc -Result $Result)
}

function New-PendingWorkOrder {
    param([string]$Code, [string]$Title)
    $result = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "create_work_order" -Body @{
        p_work_order = @{
            code        = $Code
            title       = $Title
            description = "Created by verify-workorder-cancel.ps1"
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

function New-ServiceWorkOrder {
    param(
        [string]$TenantId,
        [string]$Code,
        [string]$Title,
        [string]$Status,
        [string]$ActorId,
        [string]$TeamId,
        [string]$BuildingId,
        [string]$AssetId
    )
    $result = Invoke-TablePost -Uri "$supaUrl/rest/v1/work_orders" -ApiKey $svcKey -BearerToken $svcKey -Body @{
        tenant_id = $TenantId
        code = $Code
        title = $Title
        status = $Status
        priority = "medium"
        reported_by = $ActorId
        created_by = $ActorId
        assigned_team = $TeamId
        building_id = $BuildingId
        asset_id = $AssetId
    }
    if (-not $result.Ok -or -not $result.Body[0].id) {
        throw "Could not create service work order $Code. HTTP $($result.StatusCode): $($result.Error)"
    }
    $script:createdWorkOrderIds.Add($result.Body[0].id) | Out-Null
    return $result.Body[0].id
}

Import-DotEnvFile ".env.staging-fixtures.local"
Import-DotEnvFile ".env.local"

$supaUrl      = (Get-RequiredEnv "Supabase URL" @("VITE_SUPABASE_URL", "SUPABASE_URL")).TrimEnd("/")
$anonKey      = Get-RequiredEnv "Supabase anon key" @("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY")
$svcKey       = Get-RequiredEnv "Supabase service key" @("SUPABASE_SERVICE_ROLE_KEY")
$tenantAId    = Get-RequiredEnv "Tenant A id" @("RLS_TENANT_A_ID")
$tenantBId    = Get-RequiredEnv "Tenant B id" @("RLS_TENANT_B_ID")
$managerJwt   = Get-RequiredEnv "Tenant A manager JWT" @("RLS_TENANT_A_MANAGER_JWT")
$reporterJwt  = Get-RequiredEnv "Tenant A reporter JWT" @("RLS_TENANT_A_REPORTER_JWT")
$techJwt      = Get-RequiredEnv "Tenant A technician JWT" @("RLS_TENANT_A_TECHNICIAN_JWT")
$tenantBJwt   = Get-RequiredEnv "Tenant B user JWT" @("RLS_TENANT_B_USER_JWT")
$technicianId = Get-RequiredEnv "Tenant A technician user id" @("RLS_TENANT_A_TECHNICIAN_USER_ID")
$teamAId      = Get-RequiredEnv "Tenant A team id" @("RLS_TENANT_A_TEAM_ID")
$tenantBUserId = Get-RequiredEnv "Tenant B user id" @("RLS_TENANT_B_USER_ID")
$teamBId      = Get-RequiredEnv "Tenant B team id" @("RLS_TENANT_B_TEAM_ID")

Write-Host "--- cancel_work_order audited cancellation -------------------"

$assetA = Invoke-TableGet -Uri "$supaUrl/rest/v1/assets?code=eq.FX-A-AHU-01&select=id,tenant_id,building_id&limit=1" -ApiKey $svcKey -BearerToken $svcKey
if (-not $assetA.Ok -or $assetA.Body.Count -eq 0) {
    throw "Fixture asset not found. Run npm run prepare:staging-fixtures first."
}

$assetB = Invoke-TableGet -Uri "$supaUrl/rest/v1/assets?code=eq.FX-B-PUMP-01&select=id,tenant_id,building_id&limit=1" -ApiKey $svcKey -BearerToken $svcKey
if (-not $assetB.Ok -or $assetB.Body.Count -eq 0) {
    throw "Fixture tenant B asset not found. Run npm run prepare:staging-fixtures first."
}

$suffix = Get-Date -Format "yyMMddHHmmss"
$reason = "Pilot verifier cancellation $suffix"

$woPending = New-PendingWorkOrder -Code "FX-CAN-PEND-$suffix" -Title "Cancel pending smoke test"
$cancelPending = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woPending
    p_reason = $reason
}
if (Test-MissingCancelRpc -Result $cancelPending) {
    Add-Result "cancel_work_order RPC exists in PostgREST schema cache" "FAIL" $cancelPending.Error
    if ($script:createdWorkOrderIds.Count -gt 0) {
        $ids = ($script:createdWorkOrderIds | ForEach-Object { '"' + $_ + '"' }) -join ","
        Invoke-TableDelete -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=in.($ids)" -ApiKey $svcKey
        Invoke-TableDelete -Uri "$supaUrl/rest/v1/work_orders?id=in.($ids)" -ApiKey $svcKey
    }
    Write-Host ""
    Write-Host "--- Summary ------------------------------------------------"
    $script:results | Format-Table -AutoSize
    exit 1
}
if ($cancelPending.Ok -and $cancelPending.Body.status -eq "cancelled" -and $cancelPending.Body.reason -eq $reason) {
    Add-Result "maintenance_manager can cancel pending WO with reason" "PASS" "id=$woPending"
} else {
    Add-Result "maintenance_manager can cancel pending WO with reason" "FAIL" "HTTP $($cancelPending.StatusCode): $($cancelPending.Error)"
}

$row = Invoke-TableGet -Uri "$supaUrl/rest/v1/work_orders?id=eq.$woPending&select=id,status,cancelled_at,cancellation_reason" -ApiKey $svcKey -BearerToken $svcKey
if ($row.Ok -and $row.Body.Count -eq 1 -and $row.Body[0].status -eq "cancelled" -and $row.Body[0].cancelled_at -and $row.Body[0].cancellation_reason -eq $reason) {
    Add-Result "cancellation stores status, timestamp, and reason" "PASS" "cancelled_at=$($row.Body[0].cancelled_at)"
} else {
    Add-Result "cancellation stores status, timestamp, and reason" "FAIL" "Unexpected work order row"
}

$log = Invoke-TableGet -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=eq.$woPending&type=eq.cancellation&select=id,reason,description" -ApiKey $svcKey -BearerToken $svcKey
if ($log.Ok -and $log.Body.Count -ge 1 -and $log.Body[0].reason -eq $reason) {
    Add-Result "cancellation writes operation log" "PASS" "log_id=$($log.Body[0].id)"
} else {
    Add-Result "cancellation writes operation log" "FAIL" "No cancellation log found"
}

$woAssigned = New-ServiceWorkOrder -TenantId $tenantAId -Code "FX-CAN-ASGN-$suffix" -Title "Cancel assigned smoke test" -Status "assigned" -ActorId $technicianId -TeamId $teamAId -BuildingId $assetA.Body[0].building_id -AssetId $assetA.Body[0].id
$cancelAssigned = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woAssigned
    p_reason = "Assigned cancellation $suffix"
}
if ($cancelAssigned.Ok -and $cancelAssigned.Body.status -eq "cancelled") {
    Add-Result "maintenance_manager can cancel assigned WO with reason" "PASS" "id=$woAssigned"
} else {
    Add-Result "maintenance_manager can cancel assigned WO with reason" "FAIL" "HTTP $($cancelAssigned.StatusCode): $($cancelAssigned.Error)"
}

$woEmptyReason = New-PendingWorkOrder -Code "FX-CAN-EMPTY-$suffix" -Title "Cancel empty reason denial"
$emptyReason = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woEmptyReason
    p_reason = "   "
}
if (Test-ExpectedDeny -Result $emptyReason) {
    Add-Result "empty cancellation reason denied" "PASS" "HTTP $($emptyReason.StatusCode)"
} else {
    Add-Result "empty cancellation reason denied" "FAIL" "HTTP $($emptyReason.StatusCode): $($emptyReason.Error)"
}

$reporterDenied = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woEmptyReason
    p_reason = "Reporter should not cancel"
}
if (Test-ExpectedDeny -Result $reporterDenied) {
    Add-Result "reporter denied cancellation" "PASS" "HTTP $($reporterDenied.StatusCode)"
} else {
    Add-Result "reporter denied cancellation" "FAIL" "HTTP $($reporterDenied.StatusCode): $($reporterDenied.Error)"
}

$techDenied = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woEmptyReason
    p_reason = "Technician should not cancel"
}
if (Test-ExpectedDeny -Result $techDenied) {
    Add-Result "technician denied cancellation" "PASS" "HTTP $($techDenied.StatusCode)"
} else {
    Add-Result "technician denied cancellation" "FAIL" "HTTP $($techDenied.StatusCode): $($techDenied.Error)"
}

$woTenantB = New-ServiceWorkOrder -TenantId $tenantBId -Code "FX-CAN-XTEN-$suffix" -Title "Cross tenant cancellation denial" -Status "pending" -ActorId $tenantBUserId -TeamId $teamBId -BuildingId $assetB.Body[0].building_id -AssetId $assetB.Body[0].id
$wrongTenant = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woTenantB
    p_reason = "Wrong tenant should not cancel"
}
if (Test-ExpectedDeny -Result $wrongTenant) {
    Add-Result "wrong tenant cancellation denied" "PASS" "HTTP $($wrongTenant.StatusCode)"
} else {
    Add-Result "wrong tenant cancellation denied" "FAIL" "HTTP $($wrongTenant.StatusCode): $($wrongTenant.Error)"
}

$tenantBOwnerCancel = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $tenantBJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woTenantB
    p_reason = "Tenant B own cancellation"
}
if ($tenantBOwnerCancel.Ok -and $tenantBOwnerCancel.Body.status -eq "cancelled") {
    Add-Result "same tenant admin can cancel own tenant WO" "PASS" "id=$woTenantB"
} else {
    Add-Result "same tenant admin can cancel own tenant WO" "FAIL" "HTTP $($tenantBOwnerCancel.StatusCode): $($tenantBOwnerCancel.Error)"
}

$woInProgress = New-ServiceWorkOrder -TenantId $tenantAId -Code "FX-CAN-PROG-$suffix" -Title "In progress cancellation denial" -Status "in_progress" -ActorId $technicianId -TeamId $teamAId -BuildingId $assetA.Body[0].building_id -AssetId $assetA.Body[0].id
$inProgress = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woInProgress
    p_reason = "In progress should not cancel"
}
if (Test-ExpectedDeny -Result $inProgress) {
    Add-Result "in_progress cancellation denied" "PASS" "HTTP $($inProgress.StatusCode)"
} else {
    Add-Result "in_progress cancellation denied" "FAIL" "HTTP $($inProgress.StatusCode): $($inProgress.Error)"
}

$woCompleted = New-ServiceWorkOrder -TenantId $tenantAId -Code "FX-CAN-COMP-$suffix" -Title "Completed cancellation denial" -Status "completed" -ActorId $technicianId -TeamId $teamAId -BuildingId $assetA.Body[0].building_id -AssetId $assetA.Body[0].id
$completed = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "cancel_work_order" -Body @{
    p_work_order_id = $woCompleted
    p_reason = "Completed should not cancel"
}
if (Test-ExpectedDeny -Result $completed) {
    Add-Result "completed cancellation denied" "PASS" "HTTP $($completed.StatusCode)"
} else {
    Add-Result "completed cancellation denied" "FAIL" "HTTP $($completed.StatusCode): $($completed.Error)"
}

$direct = Invoke-TablePatch -Uri "$supaUrl/rest/v1/work_orders?id=eq.$woEmptyReason" -ApiKey $svcKey -BearerToken $svcKey -Body @{
    status = "cancelled"
    cancellation_reason = "Direct bypass attempt"
}
if (-not $direct.Ok) {
    Add-Result "direct status update to cancelled remains blocked" "PASS" "HTTP $($direct.StatusCode)"
} else {
    Add-Result "direct status update to cancelled remains blocked" "FAIL" "Direct PATCH succeeded"
}

$woDeleteProbe = New-ServiceWorkOrder -TenantId $tenantAId -Code "FX-CAN-DEL-$suffix" -Title "Direct delete denial probe" -Status "pending" -ActorId $technicianId -TeamId $teamAId -BuildingId $assetA.Body[0].building_id -AssetId $assetA.Body[0].id
$beforeDelete = Invoke-TableGet -Uri "$supaUrl/rest/v1/work_orders?id=eq.$woDeleteProbe&select=id" -ApiKey $svcKey -BearerToken $svcKey
if ($beforeDelete.Ok -and $beforeDelete.Body.Count -eq 1) {
    Add-Result "direct DELETE probe work order exists before attempt" "PASS" "id=$woDeleteProbe"
} else {
    Add-Result "direct DELETE probe work order exists before attempt" "FAIL" "Could not confirm row exists (HTTP $($beforeDelete.StatusCode))"
}

$directDelete = Invoke-TableDeleteAsUser -Uri "$supaUrl/rest/v1/work_orders?id=eq.$woDeleteProbe" -ApiKey $anonKey -BearerToken $managerJwt
Add-Result "direct DELETE attempt HTTP status (authenticated manager)" "PASS" "HTTP $($directDelete.StatusCode)"

$afterDelete = Invoke-TableGet -Uri "$supaUrl/rest/v1/work_orders?id=eq.$woDeleteProbe&select=id" -ApiKey $svcKey -BearerToken $svcKey
if ($afterDelete.Ok -and $afterDelete.Body.Count -eq 1) {
    Add-Result "authenticated direct hard delete remains blocked by RLS" "PASS" "row still exists (HTTP $($directDelete.StatusCode))"
} else {
    Add-Result "authenticated direct hard delete remains blocked by RLS" "FAIL" "row missing after DELETE attempt (HTTP $($directDelete.StatusCode))"
}

$hookSource = Get-Content -LiteralPath "src/hooks/useWorkOrders.ts" -Raw
if ($hookSource -match "Direct work order deletion is disabled" -and $hookSource -notmatch "useDeleteWorkOrder\(\)[\s\S]*?\.delete\(") {
    Add-Result "direct hard delete remains unavailable from app hook" "PASS" "useDeleteWorkOrder throws"
} else {
    Add-Result "direct hard delete remains unavailable from app hook" "FAIL" "useDeleteWorkOrder may expose delete"
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
