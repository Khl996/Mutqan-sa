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

function Add-Check {
    param(
        [string]$Area,
        [string]$Name,
        [string]$Status,
        [string]$Evidence,
        [string]$Blocks
    )

    $script:checks.Add([pscustomobject]@{
        Area = $Area
        Name = $Name
        Status = $Status
        Blocks = $Blocks
        Evidence = $Evidence
    }) | Out-Null
}

function Test-PathCheck {
    param(
        [string]$Area,
        [string]$Name,
        [string]$Path,
        [string]$Blocks
    )

    if (Test-Path -LiteralPath $Path) {
        Add-Check $Area $Name "PASS" $Path $Blocks
    } else {
        Add-Check $Area $Name "FAIL" "Missing file: $Path" $Blocks
    }
}

function Test-EnvCheck {
    param(
        [string]$Area,
        [string]$Name,
        [string[]]$Names,
        [string]$Blocks,
        [string]$MissingStatus = "FAIL"
    )

    $value = Get-EnvAny -Names $Names
    if ($value) {
        Add-Check $Area $Name "PASS" ($Names -join " or ") $Blocks
    } else {
        Add-Check $Area $Name $MissingStatus ("Missing: " + ($Names -join " or ")) $Blocks
    }
}

Import-DotEnvFile -Path ".env.local"

$script:checks = New-Object System.Collections.Generic.List[object]

Test-PathCheck "migrations" "payment service-role hardening" "supabase/migrations/113_phase2_payment_service_role_hardening.sql" "staging parity"
Test-PathCheck "migrations" "reporting foundation RPC" "supabase/migrations/114_phase2_reporting_foundation_metrics.sql" "demo ROI surface"
Test-PathCheck "migrations" "notification function hardening" "supabase/migrations/115_phase2_notification_function_hardening.sql" "staging parity"

Test-PathCheck "serverless" "payment webhook endpoint" "api/payment-webhook.ts" "payment validation"
Test-PathCheck "serverless" "payment callback verification endpoint" "api/verify-payment.ts" "payment validation"
Test-PathCheck "serverless" "PM generation cron endpoint" "api/pm-generate-wos.ts" "staging parity"

Test-PathCheck "validation" "RLS runtime verifier" "scripts/verify-rls-isolation.ps1" "RLS validation"
Test-PathCheck "validation" "payment runtime verifier" "scripts/verify-payment-runtime.ps1" "payment validation"

Test-EnvCheck "public env" "Supabase URL" @("SUPABASE_URL", "VITE_SUPABASE_URL") "RLS validation"
Test-EnvCheck "public env" "Supabase anon key" @("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY") "RLS validation"
Test-EnvCheck "public env" "App base URL" @("APP_BASE_URL", "VITE_APP_URL") "payment validation"
Test-EnvCheck "public env" "Tap public key" @("VITE_TAP_PUBLIC_KEY") "payment validation" "WARN"

Test-EnvCheck "server env" "Supabase service role key" @("SUPABASE_SERVICE_ROLE_KEY") "serverless payments and cron"
Test-EnvCheck "server env" "Tap secret key" @("TAP_SECRET_KEY") "Tap sandbox validation"
Test-EnvCheck "server env" "Payment webhook shared secret" @("PAYMENT_WEBHOOK_SECRET", "TAP_WEBHOOK_SECRET") "webhook hardening"
Test-EnvCheck "server env" "Cron secret" @("CRON_SECRET") "PM and subscription cron"

Test-EnvCheck "RLS fixtures" "Tenant A id" @("RLS_TENANT_A_ID") "RLS validation"
Test-EnvCheck "RLS fixtures" "Tenant B id" @("RLS_TENANT_B_ID") "RLS validation"
Test-EnvCheck "RLS fixtures" "Tenant A admin JWT" @("RLS_TENANT_A_ADMIN_JWT") "RLS validation"
Test-EnvCheck "RLS fixtures" "Tenant A manager JWT" @("RLS_TENANT_A_MANAGER_JWT") "RLS validation"
Test-EnvCheck "RLS fixtures" "Tenant A supervisor JWT" @("RLS_TENANT_A_SUPERVISOR_JWT") "RLS validation"
Test-EnvCheck "RLS fixtures" "Tenant A technician JWT" @("RLS_TENANT_A_TECHNICIAN_JWT") "RLS validation"
Test-EnvCheck "RLS fixtures" "Tenant A reporter JWT" @("RLS_TENANT_A_REPORTER_JWT") "RLS validation"
Test-EnvCheck "RLS fixtures" "Tenant B user JWT" @("RLS_TENANT_B_USER_JWT") "RLS validation"
Test-EnvCheck "RLS fixtures" "Platform admin JWT" @("RLS_PLATFORM_ADMIN_JWT") "RLS validation"
Test-EnvCheck "RLS fixtures" "Technician assigned WO id" @("RLS_TECHNICIAN_ASSIGNED_WO_ID") "RLS mutation proof" "WARN"
Test-EnvCheck "RLS fixtures" "Technician unassigned WO id" @("RLS_TECHNICIAN_UNASSIGNED_WO_ID") "RLS mutation proof" "WARN"

Test-EnvCheck "payment fixtures" "Payment test user JWT" @("PAYMENT_TEST_USER_JWT") "payment validation"
Test-EnvCheck "payment fixtures" "Captured Tap charge id" @("PAYMENT_CAPTURED_TAP_ID") "payment success and idempotency"
Test-EnvCheck "payment fixtures" "Failed Tap charge id" @("PAYMENT_FAILED_TAP_ID") "failed payment proof" "WARN"
Test-EnvCheck "payment fixtures" "Mismatched amount Tap charge id" @("PAYMENT_MISMATCHED_AMOUNT_TAP_ID") "amount mismatch proof" "WARN"

Add-Check "deployment" "latest code deployed to staging" "WARN" "Cannot be proven locally. Redeploy after current commit, then rerun npm run verify:payment." "stale deployment"
Add-Check "database" "migrations applied on staging" "WARN" "Cannot be proven locally. Verify functions engine_activate, get_tenant_reporting_foundation, and create_notification in Supabase SQL editor." "migration drift"

$checks | Format-Table -AutoSize

$failures = @($checks | Where-Object { $_.Status -eq "FAIL" })
if ($failures.Count -gt 0) {
    Write-Error "Staging launch gate is not green: $($failures.Count) blocking check(s) failed."
    exit 1
}

Write-Host "Staging launch gate prerequisites are present. Runtime proof still requires npm run verify:rls and npm run verify:payment."
