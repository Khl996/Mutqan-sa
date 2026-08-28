[CmdletBinding()]
param(
    [string]$PgBin = $env:MUTQAN_PG17_BIN,
    [string]$ClusterRoot = (Join-Path $env:TEMP 'mutqan-pg17-controlled-replay'),
    [int]$Port = 55439
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$databaseName = 'mutqan_controlled_replay'

if ([string]::IsNullOrWhiteSpace($PgBin)) {
    $downloadedCandidate = Join-Path $env:TEMP 'mutqan-pg17-replay\pgsql\bin'
    if (Test-Path -LiteralPath (Join-Path $downloadedCandidate 'postgres.exe')) {
        $PgBin = $downloadedCandidate
    } else {
        throw 'Set MUTQAN_PG17_BIN to a PostgreSQL 17 bin directory.'
    }
}

$PgBin = (Resolve-Path -LiteralPath $PgBin).Path
$postgres = Join-Path $PgBin 'postgres.exe'
$initdb = Join-Path $PgBin 'initdb.exe'
$pgCtl = Join-Path $PgBin 'pg_ctl.exe'
$pgIsReady = Join-Path $PgBin 'pg_isready.exe'
$psql = Join-Path $PgBin 'psql.exe'
$createdb = Join-Path $PgBin 'createdb.exe'
$dropdb = Join-Path $PgBin 'dropdb.exe'

foreach ($executable in @($postgres, $initdb, $pgCtl, $pgIsReady, $psql, $createdb, $dropdb)) {
    if (-not (Test-Path -LiteralPath $executable)) {
        throw "Required PostgreSQL executable is missing: $executable"
    }
}

$postgresVersion = (& $postgres --version)
if ($LASTEXITCODE -ne 0 -or $postgresVersion -notmatch 'PostgreSQL\)?\s+17\.') {
    throw "PostgreSQL 17 is required; found: $postgresVersion"
}

$directorySeparator = [IO.Path]::DirectorySeparatorChar
$pathSeparators = [char[]]@(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
)
$clusterPath = [IO.Path]::GetFullPath($ClusterRoot).TrimEnd($pathSeparators)
$tempPath = [IO.Path]::GetFullPath($env:TEMP).TrimEnd($pathSeparators)
$clusterPrefix = $clusterPath + $directorySeparator
$tempPrefix = $tempPath + $directorySeparator
if ($clusterPath.Equals($tempPath, [StringComparison]::OrdinalIgnoreCase) -or
    -not $clusterPrefix.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The isolated cluster must stay under the temporary directory: $tempPath"
}

$dataPath = Join-Path $clusterPath 'data'
$logPath = Join-Path $clusterPath 'postgres.log'
$generatedPath = Join-Path $clusterPath 'generated'
$markerPath = Join-Path $clusterPath '.mutqan-controlled-replay-cluster'
$markerValue = 'mutqan-controlled-replay-cluster-v1'
New-Item -ItemType Directory -Path $clusterPath -Force | Out-Null

$hasInitializedCluster = Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION')
if ($hasInitializedCluster) {
    if (-not (Test-Path -LiteralPath $markerPath) -or
        [IO.File]::ReadAllText($markerPath, [Text.Encoding]::UTF8).Trim() -ne $markerValue) {
        throw 'Refusing an existing PostgreSQL cluster that was not created by this replay harness.'
    }
} else {
    if (Test-Path -LiteralPath $dataPath) {
        $unexpectedData = Get-ChildItem -LiteralPath $dataPath -Force | Select-Object -First 1
        if ($null -ne $unexpectedData) {
            throw 'Refusing a non-empty, uninitialized replay data directory.'
        }
    }

    & $initdb -D $dataPath --username=postgres --auth=trust --encoding=UTF8 --locale=C | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to initialize the isolated PostgreSQL cluster.'
    }
    [IO.File]::WriteAllText($markerPath, $markerValue + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}
New-Item -ItemType Directory -Path $generatedPath -Force | Out-Null

$serverStartedHere = $false

function Invoke-PsqlFile {
    param(
        [Parameter(Mandatory)] [string]$File,
        [string]$Database = $databaseName,
        [switch]$Quiet
    )

    $resolved = (Resolve-Path -LiteralPath $File).Path
    Write-Host "APPLY $([IO.Path]::GetFileName($resolved))"
    $arguments = @(
        '-h', '127.0.0.1', '-p', $Port, '-U', 'postgres', '-d', $Database,
        '-v', 'ON_ERROR_STOP=1', '-X', '-f', $resolved
    )
    if ($Quiet) {
        $arguments += '-q'
    }
    & $psql @arguments | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "SQL file failed: $resolved"
    }
}

function Invoke-PsqlCommand {
    param(
        [Parameter(Mandatory)] [string]$Command,
        [string]$Database = $databaseName,
        [switch]$TuplesOnly
    )

    $arguments = @(
        '-h', '127.0.0.1', '-p', $Port, '-U', 'postgres', '-d', $Database,
        '-v', 'ON_ERROR_STOP=1', '-X'
    )
    if ($TuplesOnly) {
        $arguments += @('-A', '-t', '-q')
    }
    $arguments += @('-c', $Command)
    $result = & $psql @arguments
    if ($LASTEXITCODE -ne 0) {
        throw 'PostgreSQL command failed.'
    }
    return $result
}

function Get-CanonicalTextSha256 {
    param(
        [Parameter(Mandatory)] [string]$File
    )

    $resolved = (Resolve-Path -LiteralPath $File).Path
    $text = [IO.File]::ReadAllText($resolved, [Text.Encoding]::UTF8)
    $canonicalText = $text.Replace("`r`n", "`n").Replace("`r", "`n")
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($canonicalText)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Record-ReplayArtifact {
    param(
        [Parameter(Mandatory)] [string]$Version,
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [string]$File,
        [Parameter(Mandatory)] [string]$Mode
    )

    $resolved = (Resolve-Path -LiteralPath $File).Path
    $sha256 = Get-CanonicalTextSha256 -File $resolved
    $relativePath = [IO.Path]::GetRelativePath($repoRoot, $resolved)
    $recordedPath = if (-not [IO.Path]::IsPathRooted($relativePath) -and
        $relativePath -ne '..' -and
        -not $relativePath.StartsWith('..' + [IO.Path]::DirectorySeparatorChar)) {
        $relativePath.Replace(
            [IO.Path]::DirectorySeparatorChar,
            [IO.Path]::AltDirectorySeparatorChar
        )
    } else {
        $resolved
    }
    $escapedVersion = $Version.Replace("'", "''")
    $escapedName = $Name.Replace("'", "''")
    $escapedFile = $recordedPath.Replace("'", "''")
    $escapedHash = $sha256.Replace("'", "''")
    $escapedMode = $Mode.Replace("'", "''")
    Invoke-PsqlCommand -Command @"
INSERT INTO replay_audit.applied_artifacts
    (version, name, source_path, sha256, execution_mode)
VALUES
    ('$escapedVersion', '$escapedName', '$escapedFile', '$escapedHash', '$escapedMode');
"@ | Out-Null
}

function Apply-MigrationArtifact {
    param(
        [Parameter(Mandatory)] [string]$File,
        [string]$Mode = 'executed'
    )

    Invoke-PsqlFile -File $File -Quiet
    $baseName = [IO.Path]::GetFileNameWithoutExtension($File)
    $separator = $baseName.IndexOf('_')
    $version = if ($separator -gt 0) { $baseName.Substring(0, $separator) } else { $baseName }
    $name = if ($separator -gt 0) { $baseName.Substring($separator + 1) } else { $baseName }
    Record-ReplayArtifact -Version $version -Name $name -File $File -Mode $Mode
}

try {
    & $pgIsReady -h 127.0.0.1 -p $Port | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $runningDataPath = (Invoke-PsqlCommand -Database postgres -TuplesOnly -Command 'SHOW data_directory;').Trim()
        if ([IO.Path]::GetFullPath($runningDataPath) -ne [IO.Path]::GetFullPath($dataPath)) {
            throw "Port $Port is occupied by a different PostgreSQL cluster."
        }
    } else {
        $serverOptions = "-p $Port -h 127.0.0.1"
        & $pgCtl -D $dataPath -l $logPath -o $serverOptions -w start
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to start the isolated PostgreSQL cluster.'
        }
        $serverStartedHere = $true
    }

    $runningMajor = (Invoke-PsqlCommand -Database postgres -TuplesOnly -Command "SHOW server_version;").Trim()
    if ($runningMajor -notmatch '^17\.') {
        throw "Isolated server is not PostgreSQL 17: $runningMajor"
    }

    # The database target is fixed and the server data directory was verified
    # above, so this drop cannot touch an unrelated PostgreSQL cluster.
    & $dropdb -h 127.0.0.1 -p $Port -U postgres --if-exists $databaseName | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Unable to reset the isolated replay database.' }
    & $createdb -h 127.0.0.1 -p $Port -U postgres $databaseName | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the isolated replay database.' }

    Invoke-PsqlCommand -Command @'
CREATE SCHEMA replay_audit AUTHORIZATION postgres;
CREATE TABLE replay_audit.applied_artifacts (
    sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version text NOT NULL,
    name text NOT NULL,
    source_path text NOT NULL,
    sha256 text NOT NULL,
    execution_mode text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
'@ | Out-Null

    $baselineSource = Join-Path $repoRoot 'supabase\migrations\00000000000000_baseline.sql'
    $baselineGenerated = Join-Path $generatedPath '00000000000000_baseline.pg17.sql'
    $baselineText = [IO.File]::ReadAllText($baselineSource, [Text.Encoding]::UTF8)
    foreach ($extensionLine in @(
        'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;',
        'CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;',
        'CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;'
    )) {
        $baselineText = $baselineText.Replace(
            $extensionLine,
            "-- isolated PG17 replay omits Supabase-managed extension: $extensionLine"
        )
    }
    [IO.File]::WriteAllText(
        $baselineGenerated,
        $baselineText,
        [Text.UTF8Encoding]::new($false)
    )

    $localStubs = Join-Path $repoRoot 'verify\local_stubs.sql'
    $localStubsHash = Get-CanonicalTextSha256 -File $localStubs
    if ($localStubsHash -ne '37c6cd8c8ca1d4395b7e8d95dda78b89c92645e6f7559426d25dfd3174bc4c15') {
        throw 'Recovered local Supabase stub checksum mismatch.'
    }
    Invoke-PsqlFile -File $localStubs -Quiet
    Record-ReplayArtifact -Version 'fixture-local-stubs' -Name 'recovered_supabase_schema_stub' -File $localStubs -Mode 'recovered_exact_compatibility_fixture'

    $localRuntime = Join-Path $repoRoot 'verify\local_supabase_runtime.sql'
    Invoke-PsqlFile -File $localRuntime -Quiet
    Record-ReplayArtifact -Version 'fixture-local-runtime' -Name 'supabase_runtime_compatibility' -File $localRuntime -Mode 'replay_only_compatibility_fixture'

    $replayPrerequisites = Join-Path $repoRoot 'verify\replay_prerequisites.sql'
    Invoke-PsqlFile -File $replayPrerequisites -Quiet
    Record-ReplayArtifact -Version 'bootstrap-runtime-secrets' -Name 'baseline_replay_prerequisite' -File $replayPrerequisites -Mode 'non_ledger_bootstrap_reconciliation'

    Invoke-PsqlFile -File $baselineGenerated -Quiet
    Record-ReplayArtifact -Version '00000000000000-source' -Name 'baseline' -File $baselineSource -Mode 'historical_source_transformed_for_isolated_pg17'
    Record-ReplayArtifact -Version '00000000000000-executed' -Name 'baseline_pg17' -File $baselineGenerated -Mode 'executed_with_supabase_extensions_stubbed'

    $expectedRecoveredHashes = [ordered]@{
        '146_intake_foundation.sql' = '47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822'
        '147_rounds_v0.sql' = 'acc450cf9d6df5886419f68ec19f7e059a623313d3e2ea90f6395ba00b796f1d'
        '148_post_demo_print_and_round_routing.sql' = 'f3a8ae95dc4816174b1c3d2e599cba62700955e0689dc69494ed30143a805871'
        '20260706100734_intake_foundation.sql' = '47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822'
        '20260707085234_149_hospital_enable_facilities_locations.sql' = '530ee417f06e0e7504bf95f95d0f36d909c93bbe3ae90d79f6f2315638386467'
    }
    foreach ($entry in $expectedRecoveredHashes.GetEnumerator()) {
        $path = Join-Path $repoRoot (Join-Path 'supabase\migrations' $entry.Key)
        $actual = Get-CanonicalTextSha256 -File $path
        if ($actual -ne $entry.Value) {
            throw "Recovered migration checksum mismatch: $($entry.Key)"
        }
    }

    $migrationRoot = Join-Path $repoRoot 'supabase\migrations'
    $expectedJuneMigrations = @(
        '20260602213839_hospital_lite_report_foundation.sql',
        '20260602220332_132_hospital_lite_set_modules.sql',
        '20260603052554_133_hospital_lite_public_portal_phase3.sql',
        '20260603072505_134_hospital_lite_technician_rls.sql',
        '20260603101927_135_hospital_lite_pdf_phase6.sql',
        '20260603105715_136_rls_fix_a1_work_order_costs.sql',
        '20260603105732_136_rls_fix_a2_custom_roles_explicit_deny.sql',
        '20260603105742_136_rls_fix_a3_work_order_parts_authenticated.sql',
        '20260603111244_137_rls_fix_a4_work_orders_cleanup.sql',
        '20260603111253_138_seed_cleanup_hospital_lite_demo.sql',
        '20260603203027_139_hospital_eradah_quryaat_lite_mode.sql',
        '20260620193211_fix_public_report_photos_rls.sql',
        '20260620200930_fix_security_definer_view_and_dead_function.sql',
        '20260621094216_142_pm_engine_phase1_foundation.sql',
        '20260621094238_143_seed_blackout_windows.sql',
        '20260622064857_144_pm_engine_generator_rewrite.sql',
        '20260622072258_145_fix_blackout_label_null_overwrite.sql',
        '20260627113236_field_governance_wave1.sql',
        '20260627142423_field_governance_wave2_approval_matrix.sql',
        '20260627144744_field_governance_wave2_sla_pause.sql',
        '20260627194156_field_governance_wave2_decision_queue.sql',
        '20260627202142_field_governance_wave3_delegation_authority.sql',
        '20260628181326_field_governance_wave3_whatsapp_approvals.sql',
        '20260628182408_fix_governance_token_pgcrypto_schema.sql'
    )
    $actualJuneMigrations = @(
        Get-ChildItem -LiteralPath $migrationRoot -File |
        Where-Object { $_.Name -match '^202606\d{8}_.*\.sql$' } |
        Sort-Object Name |
        Select-Object -ExpandProperty Name
    )
    $juneManifestDifference = Compare-Object $expectedJuneMigrations $actualJuneMigrations
    if ($null -ne $juneManifestDifference) {
        throw "June migration manifest mismatch: $($juneManifestDifference | Out-String)"
    }

    foreach ($migrationName in $expectedJuneMigrations) {
        if ($migrationName -eq '20260603203027_139_hospital_eradah_quryaat_lite_mode.sql') {
            Invoke-PsqlFile -File (Join-Path $repoRoot 'verify\replay_business_prerequisites.sql') -Quiet
            Record-ReplayArtifact -Version 'fixture-20260603203027' -Name 'external_hospital_tenant_prerequisite' -File (Join-Path $repoRoot 'verify\replay_business_prerequisites.sql') -Mode 'external_business_data_fixture'
        }
        Apply-MigrationArtifact -File (Join-Path $migrationRoot $migrationName)
    }

    $executedIntake = Join-Path $migrationRoot '20260706100734_intake_foundation.sql'
    Apply-MigrationArtifact -File $executedIntake

    # Historical production executed the timestamped intake SQL once, then
    # repaired version 146 into the ledger. Record, but do not execute, alias 146.
    Record-ReplayArtifact -Version '146' -Name 'intake_foundation' -File (Join-Path $migrationRoot '146_intake_foundation.sql') -Mode 'ledger_alias_no_execution'

    Apply-MigrationArtifact -File (Join-Path $migrationRoot '147_rounds_v0.sql')
    Apply-MigrationArtifact -File (Join-Path $migrationRoot '148_post_demo_print_and_round_routing.sql')
    Apply-MigrationArtifact -File (Join-Path $migrationRoot '20260707085234_149_hospital_enable_facilities_locations.sql')
    Apply-MigrationArtifact -File (Join-Path $migrationRoot '20260820234813_wave0_harden_pm_snapshot_and_rpc_surface.sql')

    # Wave 0 has one checkpoint-specific assertion about trigger-depth trust;
    # run it before the P0 explicit-authority migration intentionally removes it.
    Invoke-PsqlFile -File (Join-Path $repoRoot 'supabase\tests\wave0_rpc_surface.sql') -Quiet

    $expectedP0Migrations = @(
        '20260821013641_p0_central_authority_and_provisioning.sql',
        '20260821014202_p0_runtime_secret_reconciliation.sql',
        '20260821014205_p0_pm_snapshot_explicit_authority.sql'
    )
    $actualP0Migrations = @(
        Get-ChildItem -LiteralPath $migrationRoot -File |
        Where-Object { $_.Name -match '^20260821\d{6}_p0_.*\.sql$' } |
        Sort-Object Name |
        Select-Object -ExpandProperty Name
    )
    $p0ManifestDifference = Compare-Object $expectedP0Migrations $actualP0Migrations
    if ($null -ne $p0ManifestDifference) {
        throw "P0 migration manifest mismatch: $($p0ManifestDifference | Out-String)"
    }
    foreach ($migrationName in $expectedP0Migrations) {
        Apply-MigrationArtifact -File (Join-Path $migrationRoot $migrationName)
    }

    foreach ($testName in @(
        'p0_runtime_secret_reconciliation.sql',
        'p0_authority_adversarial.sql',
        'p0_pm_snapshot_authority.sql'
    )) {
        $testPath = Join-Path $repoRoot (Join-Path 'supabase\tests' $testName)
        if (-not (Test-Path -LiteralPath $testPath)) {
            throw "Required adversarial test is missing: $testName"
        }
        Invoke-PsqlFile -File $testPath -Quiet
    }

    Apply-MigrationArtifact -File (Join-Path $migrationRoot '20260822165746_p0_anonymous_definer_allowlist.sql')
    Invoke-PsqlFile -File (Join-Path $repoRoot 'supabase\tests\p0_anonymous_definer_allowlist.sql') -Quiet

    Apply-MigrationArtifact -File (Join-Path $migrationRoot '20260824180500_p0_work_order_proof_authority.sql')
    Invoke-PsqlFile -File (Join-Path $repoRoot 'supabase\tests\p0_work_order_proof_authority.sql') -Quiet

    Apply-MigrationArtifact -File (Join-Path $migrationRoot '20260826230345_tenant_release_control.sql')
    Invoke-PsqlFile -File (Join-Path $repoRoot 'supabase\tests\p0_tenant_release_control.sql') -Quiet

    Apply-MigrationArtifact -File (Join-Path $migrationRoot '20260828084500_tenant_governance_authority_bootstrap.sql')
    Invoke-PsqlFile -File (Join-Path $repoRoot 'supabase\tests\p0_tenant_governance_authority_bootstrap.sql') -Quiet

    Invoke-PsqlFile -File (Join-Path $repoRoot 'supabase\tests\p0_payment_concurrency_setup.sql') -Quiet
    $paymentCall = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'supabase\tests\p0_payment_activation_call.sql')).Path
    $paymentOut1 = Join-Path $generatedPath 'payment-call-1.out'
    $paymentErr1 = Join-Path $generatedPath 'payment-call-1.err'
    $paymentOut2 = Join-Path $generatedPath 'payment-call-2.out'
    $paymentErr2 = Join-Path $generatedPath 'payment-call-2.err'
    $baseArguments = @(
        '-h', '127.0.0.1', '-p', $Port, '-U', 'postgres', '-d', $databaseName,
        '-v', 'ON_ERROR_STOP=1', '-X', '-A', '-t', '-q'
    )
    $call1 = Start-Process -FilePath $psql -ArgumentList (
        $baseArguments + @('-v', 'hold_seconds=1', '-f', ('"' + $paymentCall + '"'))
    ) -RedirectStandardOutput $paymentOut1 -RedirectStandardError $paymentErr1 -WindowStyle Hidden -PassThru
    Start-Sleep -Milliseconds 150
    $call2 = Start-Process -FilePath $psql -ArgumentList (
        $baseArguments + @('-v', 'hold_seconds=0', '-f', ('"' + $paymentCall + '"'))
    ) -RedirectStandardOutput $paymentOut2 -RedirectStandardError $paymentErr2 -WindowStyle Hidden -PassThru
    $call1.WaitForExit()
    $call2.WaitForExit()
    if ($call1.ExitCode -ne 0 -or $call2.ExitCode -ne 0) {
        Get-Content -LiteralPath $paymentErr1, $paymentErr2 | Out-Host
        throw 'A concurrent payment activation session failed.'
    }

    $json1 = Get-Content -LiteralPath $paymentOut1 |
        Where-Object { $_.TrimStart().StartsWith('{') } |
        Select-Object -Last 1 |
        ConvertFrom-Json
    $json2 = Get-Content -LiteralPath $paymentOut2 |
        Where-Object { $_.TrimStart().StartsWith('{') } |
        Select-Object -Last 1 |
        ConvertFrom-Json
    if ($json1.invoice_id -ne $json2.invoice_id -or $json1.subscription_id -ne $json2.subscription_id) {
        throw 'Concurrent payment retries returned different activation identifiers.'
    }

    $flag1Property = $json1.PSObject.Properties['idempotent_replay']
    $flag2Property = $json2.PSObject.Properties['idempotent_replay']
    $flag1IsReplay = $null -ne $flag1Property -and $flag1Property.Value -eq $true
    $flag2IsReplay = $null -ne $flag2Property -and $flag2Property.Value -eq $true
    $flag1IsFresh = $null -eq $flag1Property
    $flag2IsFresh = $null -eq $flag2Property
    if (-not (($flag1IsReplay -and $flag2IsFresh) -or ($flag2IsReplay -and $flag1IsFresh))) {
        throw 'Expected exactly one fresh payment activation and one explicit idempotent replay.'
    }

    $persistedPaymentText = ((Invoke-PsqlCommand -TuplesOnly -Command @"
SELECT jsonb_build_object(
    'invoice_id', i.id,
    'subscription_id', s.id
)
  FROM public.billing_invoices i
  JOIN public.tenant_subscriptions s ON s.id = i.subscription_id
 WHERE i.payment_reference = 'p0-concurrent-payment-20260821';
"@) -join [Environment]::NewLine).Trim()
    $persistedPayment = $persistedPaymentText | ConvertFrom-Json
    if ($json1.invoice_id -ne $persistedPayment.invoice_id -or
        $json1.subscription_id -ne $persistedPayment.subscription_id -or
        $json2.invoice_id -ne $persistedPayment.invoice_id -or
        $json2.subscription_id -ne $persistedPayment.subscription_id) {
        throw 'Concurrent payment responses do not match the persisted invoice/subscription binding.'
    }

    Invoke-PsqlFile -File (Join-Path $repoRoot 'supabase\tests\p0_payment_concurrency_assert.sql') -Quiet

    $artifactCount = (Invoke-PsqlCommand -TuplesOnly -Command 'SELECT count(*) FROM replay_audit.applied_artifacts;').Trim()
    Write-Host "PASS: PostgreSQL $runningMajor controlled replay completed with $artifactCount recorded artifacts."
    Write-Host "PASS: concurrent payment calls returned invoice $($json1.invoice_id) and subscription $($json1.subscription_id)."
}
finally {
    if ($serverStartedHere) {
        & $pgCtl -D $dataPath -m fast -w stop
    }
}
