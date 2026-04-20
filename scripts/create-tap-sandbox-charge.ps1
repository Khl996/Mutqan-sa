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

function Require-Env {
    param([string]$Name)
    $value = Get-EnvAny -Names @($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required environment variable: $Name"
    }
    return $value
}

Import-DotEnvFile -Path ".env.local"
Import-DotEnvFile -Path ".env.staging-fixtures.local"

$baseUrl = Get-EnvAny -Names @("APP_BASE_URL", "VITE_APP_URL")
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
    throw "Missing APP_BASE_URL or VITE_APP_URL"
}
$baseUrl = $baseUrl.TrimEnd("/")

$tenantId = Require-Env "RLS_TENANT_A_ID"
$planId = Require-Env "MUTQAN_FIXTURE_PLAN_ID"
$jwt = Require-Env "PAYMENT_TEST_USER_JWT"
$supabaseUrl = Get-EnvAny -Names @("VITE_SUPABASE_URL", "SUPABASE_URL")
$serviceRoleKey = Require-Env "SUPABASE_SERVICE_ROLE_KEY"

if ([string]::IsNullOrWhiteSpace($supabaseUrl)) {
    throw "Missing VITE_SUPABASE_URL or SUPABASE_URL"
}
$supabaseUrl = $supabaseUrl.TrimEnd("/")

$planPatch = @{
    price_monthly = 1
    price_yearly = 1
}

Invoke-RestMethod `
    -Method Patch `
    -Uri "$supabaseUrl/rest/v1/subscription_plans?id=eq.$planId" `
    -Headers @{
        "apikey" = $serviceRoleKey
        "Authorization" = "Bearer $serviceRoleKey"
        "Content-Type" = "application/json"
        "Prefer" = "return=minimal"
    } `
    -Body ($planPatch | ConvertTo-Json -Compress) | Out-Null

Write-Host "Fixture subscription plan price set to SAR 1 for monthly and yearly billing."

$body = @{
    planId = $planId
    tenantId = $tenantId
    billingCycle = "yearly"
    customerEmail = "fixture.tenant.a.admin@mutqan.test"
    customerName = "Fixture Tenant A Admin"
    customerPhone = "500000001"
}

$response = Invoke-RestMethod `
    -Method Post `
    -Uri "$baseUrl/api/create-charge" `
    -Headers @{
        "Authorization" = "Bearer $jwt"
        "Content-Type" = "application/json"
        "Accept" = "application/json"
    } `
    -Body ($body | ConvertTo-Json -Compress)

Write-Host "Tap sandbox charge created."
Write-Host "PAYMENT_CAPTURED_TAP_ID=$($response.id)"
Write-Host "Status=$($response.status)"
Write-Host "Open this URL, complete the Tap sandbox payment, then add PAYMENT_CAPTURED_TAP_ID to .env.local:"
Write-Host $response.redirect_url
