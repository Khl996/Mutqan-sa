$ErrorActionPreference = "Stop"

function Import-DotEnvFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }

        $parts = $line.Split("=", 2)
        $name = $parts[0].Trim()
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
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }
    return $null
}

function Get-RequiredEnv {
    param(
        [string]$DisplayName,
        [string[]]$Names
    )

    $value = Get-EnvAny -Names $Names
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required environment variable: $DisplayName ($($Names -join ' or '))"
    }
    return $value
}

function Invoke-RlsRead {
    param(
        [string]$SupabaseUrl,
        [string]$AnonKey,
        [string]$Token,
        [string]$Table,
        [string]$TenantId
    )

    $uri = "$SupabaseUrl/rest/v1/$Table" + "?select=id&tenant_id=eq.$TenantId&limit=1"
    $headers = @{
        "apikey" = $AnonKey
        "Authorization" = "Bearer $Token"
        "Accept" = "application/json"
    }

    try {
        $rows = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 30
        return @{
            Ok = $true
            Rows = $rows
            Error = $null
        }
    }
    catch {
        $message = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $message = $_.ErrorDetails.Message
        }

        return @{
            Ok = $false
            Rows = @()
            Error = $message
        }
    }
}

function Invoke-RlsRpc {
    param(
        [string]$SupabaseUrl,
        [string]$AnonKey,
        [string]$Token,
        [string]$FunctionName,
        [hashtable]$Body
    )

    $uri = "$SupabaseUrl/rest/v1/rpc/$FunctionName"
    $headers = @{
        "apikey" = $AnonKey
        "Authorization" = "Bearer $Token"
        "Accept" = "application/json"
        "Content-Type" = "application/json"
    }

    try {
        $response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body ($Body | ConvertTo-Json -Compress) -TimeoutSec 30
        return @{
            Ok = $true
            Response = $response
            Error = $null
        }
    }
    catch {
        $message = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $message = $_.ErrorDetails.Message
        }

        return @{
            Ok = $false
            Response = $null
            Error = $message
        }
    }
}

function Get-RowCount {
    param($Rows)

    if ($null -eq $Rows) {
        return 0
    }

    if ($Rows -is [System.Array]) {
        return $Rows.Count
    }

    return 1
}

function Add-Pass {
    param([string]$Message)
    $script:passes.Add($Message) | Out-Null
}

function Add-Failure {
    param([string]$Message)
    $script:failures.Add($Message) | Out-Null
}

function Add-Warning {
    param([string]$Message)
    $script:warnings.Add($Message) | Out-Null
}

Import-DotEnvFile -Path ".env.local"

$supabaseUrl = (Get-RequiredEnv -DisplayName "Supabase URL" -Names @("SUPABASE_URL", "VITE_SUPABASE_URL")).TrimEnd("/")
$anonKey = Get-RequiredEnv -DisplayName "Supabase anon key" -Names @("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
$tenantAId = Get-RequiredEnv -DisplayName "Tenant A id" -Names @("RLS_TENANT_A_ID")
$tenantBId = Get-RequiredEnv -DisplayName "Tenant B id" -Names @("RLS_TENANT_B_ID")

$tenantARoles = @(
    @{ Name = "tenant_admin"; Token = (Get-RequiredEnv -DisplayName "Tenant A admin JWT" -Names @("RLS_TENANT_A_ADMIN_JWT")) },
    @{ Name = "maintenance_manager"; Token = (Get-RequiredEnv -DisplayName "Tenant A manager JWT" -Names @("RLS_TENANT_A_MANAGER_JWT")) },
    @{ Name = "supervisor"; Token = (Get-RequiredEnv -DisplayName "Tenant A supervisor JWT" -Names @("RLS_TENANT_A_SUPERVISOR_JWT")) },
    @{ Name = "technician"; Token = (Get-RequiredEnv -DisplayName "Tenant A technician JWT" -Names @("RLS_TENANT_A_TECHNICIAN_JWT")) },
    @{ Name = "reporter"; Token = (Get-RequiredEnv -DisplayName "Tenant A reporter JWT" -Names @("RLS_TENANT_A_REPORTER_JWT")) }
)

$tenantBUser = @{
    Name = "tenant_b_user"
    Token = (Get-RequiredEnv -DisplayName "Tenant B user JWT" -Names @("RLS_TENANT_B_USER_JWT"))
}

$platformAdmin = @{
    Name = "platform_admin"
    Token = (Get-RequiredEnv -DisplayName "Platform admin JWT" -Names @("RLS_PLATFORM_ADMIN_JWT"))
}

$tenantScopedTables = @(
    "work_orders",
    "assets",
    "buildings",
    "inventory_items",
    "notifications",
    "tenant_subscriptions",
    "billing_invoices",
    "job_plans",
    "pm_schedules"
)

$script:passes = New-Object System.Collections.Generic.List[string]
$script:failures = New-Object System.Collections.Generic.List[string]
$script:warnings = New-Object System.Collections.Generic.List[string]

Write-Host "RLS tenant isolation verification"
Write-Host "Tenant A: $tenantAId"
Write-Host "Tenant B: $tenantBId"
Write-Host ""

foreach ($role in $tenantARoles) {
    foreach ($table in $tenantScopedTables) {
        $sameTenant = Invoke-RlsRead -SupabaseUrl $supabaseUrl -AnonKey $anonKey -Token $role.Token -Table $table -TenantId $tenantAId
        if (-not $sameTenant.Ok) {
            Add-Failure "$($role.Name) could not query own-tenant ${table}: $($sameTenant.Error)"
            continue
        }
        Add-Pass "$($role.Name) can query own-tenant $table"

        $otherTenant = Invoke-RlsRead -SupabaseUrl $supabaseUrl -AnonKey $anonKey -Token $role.Token -Table $table -TenantId $tenantBId
        if (-not $otherTenant.Ok) {
            Add-Failure "$($role.Name) query against other-tenant $table errored instead of returning an empty result: $($otherTenant.Error)"
            continue
        }

        $otherTenantCount = Get-RowCount -Rows $otherTenant.Rows
        if ($otherTenantCount -gt 0) {
            Add-Failure "$($role.Name) can read $otherTenantCount row(s) from tenant B table $table"
        }
        else {
            Add-Pass "$($role.Name) cannot read tenant B $table"
        }
    }
}

foreach ($table in $tenantScopedTables) {
    $tenantBReadA = Invoke-RlsRead -SupabaseUrl $supabaseUrl -AnonKey $anonKey -Token $tenantBUser.Token -Table $table -TenantId $tenantAId
    if (-not $tenantBReadA.Ok) {
        Add-Failure "tenant_b_user query against tenant A $table errored instead of returning empty: $($tenantBReadA.Error)"
        continue
    }

    if ((Get-RowCount -Rows $tenantBReadA.Rows) -gt 0) {
        Add-Failure "tenant_b_user can read tenant A $table"
    }
    else {
        Add-Pass "tenant_b_user cannot read tenant A $table"
    }
}

foreach ($table in $tenantScopedTables) {
    foreach ($tenantId in @($tenantAId, $tenantBId)) {
        $platformRead = Invoke-RlsRead -SupabaseUrl $supabaseUrl -AnonKey $anonKey -Token $platformAdmin.Token -Table $table -TenantId $tenantId
        if (-not $platformRead.Ok) {
            Add-Failure "platform_admin could not query tenant $tenantId ${table}: $($platformRead.Error)"
            continue
        }

        if ((Get-RowCount -Rows $platformRead.Rows) -eq 0) {
            Add-Warning "platform_admin query for tenant $tenantId $table returned 0 rows. This is acceptable only if the fixture has no rows."
        }
        else {
            Add-Pass "platform_admin can query tenant $tenantId $table"
        }
    }
}

$allowMutationTests = (Get-EnvAny -Names @("RLS_ALLOW_MUTATION_TESTS")) -eq "1"
if ($allowMutationTests) {
    $assignedWoId = Get-RequiredEnv -DisplayName "Assigned work order id for technician" -Names @("RLS_TECHNICIAN_ASSIGNED_WO_ID")
    $unassignedWoId = Get-RequiredEnv -DisplayName "Unassigned work order id for technician" -Names @("RLS_TECHNICIAN_UNASSIGNED_WO_ID")
    $technicianToken = ($tenantARoles | Where-Object { $_.Name -eq "technician" }).Token
    $reporterToken = ($tenantARoles | Where-Object { $_.Name -eq "reporter" }).Token

    Add-Warning "Mutation tests are enabled. Use disposable work-order fixtures because start_work_order changes status."

    $techAssigned = Invoke-RlsRpc -SupabaseUrl $supabaseUrl -AnonKey $anonKey -Token $technicianToken -FunctionName "start_work_order" -Body @{ p_work_order_id = $assignedWoId }
    if ($techAssigned.Ok) {
        Add-Pass "technician can start assigned work order"
    }
    else {
        Add-Failure "technician could not start assigned work order: $($techAssigned.Error)"
    }

    $techUnassigned = Invoke-RlsRpc -SupabaseUrl $supabaseUrl -AnonKey $anonKey -Token $technicianToken -FunctionName "start_work_order" -Body @{ p_work_order_id = $unassignedWoId }
    if ($techUnassigned.Ok) {
        Add-Failure "technician could start unassigned work order"
    }
    else {
        Add-Pass "technician cannot start unassigned work order"
    }

    $reporterStart = Invoke-RlsRpc -SupabaseUrl $supabaseUrl -AnonKey $anonKey -Token $reporterToken -FunctionName "start_work_order" -Body @{ p_work_order_id = $assignedWoId }
    if ($reporterStart.Ok) {
        Add-Failure "reporter could start a work order"
    }
    else {
        Add-Pass "reporter cannot start work orders"
    }
}
else {
    Add-Warning "Assigned-work-order mutation tests skipped. Set RLS_ALLOW_MUTATION_TESTS=1 with disposable fixture IDs to test technician/reporter action boundaries."
}

if ($passes.Count -gt 0) {
    Write-Host "Passes: $($passes.Count)"
    foreach ($pass in $passes) {
        Write-Host "  PASS - $pass"
    }
    Write-Host ""
}

if ($warnings.Count -gt 0) {
    Write-Host "Warnings: $($warnings.Count)"
    foreach ($warning in $warnings) {
        Write-Host "  WARN - $warning"
    }
    Write-Host ""
}

if ($failures.Count -gt 0) {
    Write-Error "RLS verification failed:`n$($failures -join "`n")"
    exit 1
}

Write-Host "RLS verification passed."
