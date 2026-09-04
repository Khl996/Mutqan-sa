[CmdletBinding()]
param(
    [string]$PgBin = 'C:\Users\Asas\AppData\Local\Temp\mutqan-pg17-full\extracted-17.11\pgsql\bin',
    [string]$OpenSsl = 'C:\Program Files\Git\usr\bin\openssl.exe',
    [string]$BackupRoot = (Join-Path $env:LOCALAPPDATA 'Mutqan\ProductionBackupGate'),
    [string]$ProjectRef = 'mzpohntjotgeeaukwnbz',
    [string]$PoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com',
    [int]$PoolerPort = 5432,
    [string]$SourceUser = '',
    [string]$SourceDatabase = 'postgres',
    [ValidateSet('require', 'verify-full', 'disable')]
    [string]$SourceSslMode = 'require',
    [int]$RestorePort = 55440
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sourceUserName = if ([string]::IsNullOrWhiteSpace($SourceUser)) {
    "postgres.$ProjectRef"
} else {
    $SourceUser
}
$pgBinPath = (Resolve-Path -LiteralPath $PgBin).Path
$openSslPath = (Resolve-Path -LiteralPath $OpenSsl).Path
$backupRootPath = [IO.Path]::GetFullPath($BackupRoot).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
)
$repoPrefix = $repoRoot.TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
) + [IO.Path]::DirectorySeparatorChar
$backupPrefix = $backupRootPath + [IO.Path]::DirectorySeparatorChar

if ($backupRootPath.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $backupPrefix.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'BackupRoot must be outside the Git repository.'
}

$tools = [ordered]@{
    postgres  = Join-Path $pgBinPath 'postgres.exe'
    initdb    = Join-Path $pgBinPath 'initdb.exe'
    pg_ctl    = Join-Path $pgBinPath 'pg_ctl.exe'
    pg_isready = Join-Path $pgBinPath 'pg_isready.exe'
    psql      = Join-Path $pgBinPath 'psql.exe'
    createdb  = Join-Path $pgBinPath 'createdb.exe'
    pg_dump   = Join-Path $pgBinPath 'pg_dump.exe'
    pg_dumpall = Join-Path $pgBinPath 'pg_dumpall.exe'
    pg_restore = Join-Path $pgBinPath 'pg_restore.exe'
}
foreach ($toolPath in $tools.Values) {
    if (-not (Test-Path -LiteralPath $toolPath -PathType Leaf)) {
        throw "Required PostgreSQL executable is missing: $toolPath"
    }
}

$postgresVersion = (& $tools.postgres --version)
if ($LASTEXITCODE -ne 0 -or $postgresVersion -notmatch 'PostgreSQL\)?\s+17\.') {
    throw "PostgreSQL 17 is required; found: $postgresVersion"
}

function Assert-PathInside {
    param(
        [Parameter(Mandatory)] [string]$Candidate,
        [Parameter(Mandatory)] [string]$Parent
    )

    $candidatePath = [IO.Path]::GetFullPath($Candidate)
    $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $parentPathPrefix = $parentPath + [IO.Path]::DirectorySeparatorChar
    if (-not $candidatePath.StartsWith($parentPathPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing path outside the expected parent: $candidatePath"
    }
    return $candidatePath
}

function Remove-ScopedItem {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Parent,
        [switch]$Recurse
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    $validatedPath = Assert-PathInside -Candidate $Path -Parent $Parent
    if ($Recurse) {
        Remove-Item -LiteralPath $validatedPath -Recurse -Force
    } else {
        Remove-Item -LiteralPath $validatedPath -Force
    }
}

function Convert-SecureStringToPlainText {
    param([Parameter(Mandatory)] [Security.SecureString]$SecureValue)
    return ([Net.NetworkCredential]::new('', $SecureValue)).Password
}

function Invoke-PsqlScalar {
    param(
        [Parameter(Mandatory)] [string]$Sql,
        [Parameter(Mandatory)] [string]$HostName,
        [Parameter(Mandatory)] [int]$Port,
        [Parameter(Mandatory)] [string]$UserName,
        [Parameter(Mandatory)] [string]$Database
    )

    $psqlArguments = @(
        "--host=$HostName",
        "--port=$Port",
        "--username=$UserName",
        "--dbname=$Database",
        '--no-psqlrc',
        '--set=ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '--quiet',
        "--command=$Sql"
    )
    $result = & $tools.psql @psqlArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'A PostgreSQL inventory query failed.'
    }
    return (($result -join [Environment]::NewLine).Trim())
}

function Get-InventorySql {
    return @'
WITH selected_schemas(schema_name) AS (
  VALUES
    ('auth'),
    ('storage'),
    ('internal'),
    ('pm_legacy_archive'),
    ('public'),
    ('supabase_migrations')
),
selected_relations AS (
  SELECT c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN (SELECT schema_name FROM selected_schemas)
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend d
      WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
),
selected_tables AS (
  SELECT * FROM selected_relations WHERE relkind IN ('r', 'p')
),
selected_functions AS (
  SELECT p.oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN (SELECT schema_name FROM selected_schemas)
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass
        AND d.objid = p.oid
        AND d.deptype = 'e'
    )
),
row_totals AS (
  SELECT COALESCE(SUM(
    ((xpath('/row/c/text()', query_to_xml(
      format('SELECT count(*) AS c FROM %I.%I', nspname, relname),
      false,
      true,
      ''
    )))[1]::text)::bigint
  ), 0) AS selected_total_rows
  FROM selected_tables
),
ledger AS (
  SELECT
    count(*) AS ledger_rows,
    min(version) AS first_version,
    max(version) AS last_version,
    encode(extensions.digest(
      COALESCE(string_agg(version || ':' || COALESCE(name, ''), E'\n' ORDER BY version, name), ''),
      'sha256'
    ), 'hex') AS ledger_sha256
  FROM supabase_migrations.schema_migrations
)
SELECT jsonb_build_object(
  'captured_at_utc', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'server_version', current_setting('server_version'),
  'database_bytes', pg_database_size(current_database()),
  'selected_schemas', jsonb_build_array('auth','storage','internal','pm_legacy_archive','public','supabase_migrations'),
  'table_count', (SELECT count(*) FROM selected_tables),
  'view_count', (SELECT count(*) FROM selected_relations WHERE relkind IN ('v','m')),
  'function_count', (SELECT count(*) FROM selected_functions),
  'rls_table_count', (SELECT count(*) FROM selected_tables WHERE relrowsecurity),
  'policy_count', (
    SELECT count(*)
    FROM pg_policy p
    JOIN selected_tables t ON t.oid = p.polrelid
  ),
  'trigger_count', (
    SELECT count(*)
    FROM pg_trigger t
    JOIN selected_tables r ON r.oid = t.tgrelid
    WHERE NOT t.tgisinternal
  ),
  'selected_total_rows', (SELECT selected_total_rows FROM row_totals),
  'ledger_rows', ledger.ledger_rows,
  'ledger_first_version', ledger.first_version,
  'ledger_last_version', ledger.last_version,
  'ledger_sha256', ledger.ledger_sha256,
  'storage_bucket_count', (SELECT count(*) FROM storage.buckets),
  'storage_object_metadata_count', (SELECT count(*) FROM storage.objects),
  'work_order_pdfs_object_count', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'work-order-pdfs'),
  'runtime_secret_row_count', (SELECT count(*) FROM internal.runtime_secrets),
  'custom_role_count', (
    SELECT count(*)
    FROM pg_roles
    WHERE rolname !~ '^pg_'
      AND rolname !~ '^(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)$'
  )
)::text
FROM ledger;
'@
}

function Compare-Inventory {
    param(
        [Parameter(Mandatory)] [pscustomobject]$Source,
        [Parameter(Mandatory)] [pscustomobject]$Target,
        [Parameter(Mandatory)] [string]$Context
    )

    $properties = @(
        'table_count',
        'view_count',
        'function_count',
        'rls_table_count',
        'policy_count',
        'trigger_count',
        'selected_total_rows',
        'ledger_rows',
        'ledger_first_version',
        'ledger_last_version',
        'ledger_sha256',
        'storage_bucket_count',
        'storage_object_metadata_count',
        'work_order_pdfs_object_count',
        'runtime_secret_row_count',
        'custom_role_count'
    )
    $differences = foreach ($property in $properties) {
        if ([string]$Source.$property -cne [string]$Target.$property) {
            [pscustomobject]@{
                Property = $property
                Source = $Source.$property
                Target = $Target.$property
            }
        }
    }
    if ($differences) {
        throw "$Context inventory mismatch:`n$($differences | Format-Table -AutoSize | Out-String)"
    }
}

function Protect-Artifact {
    param(
        [Parameter(Mandatory)] [string]$PlainPath,
        [Parameter(Mandatory)] [string]$EncryptedPath
    )

    $encryptArguments = @(
        'enc',
        '-aes-256-cbc',
        '-salt',
        '-saltlen', '16',
        '-pbkdf2',
        '-iter', '600000',
        '-md', 'sha256',
        '-pass', 'env:MUTQAN_BACKUP_PASSPHRASE',
        '-in', $PlainPath,
        '-out', $EncryptedPath
    )
    & $openSslPath @encryptArguments
    if ($LASTEXITCODE -ne 0 -or
        -not (Test-Path -LiteralPath $EncryptedPath -PathType Leaf) -or
        (Get-Item -LiteralPath $EncryptedPath).Length -eq 0) {
        throw "Encryption failed: $EncryptedPath"
    }
}

function Unprotect-Artifact {
    param(
        [Parameter(Mandatory)] [string]$EncryptedPath,
        [Parameter(Mandatory)] [string]$PlainPath
    )

    $decryptArguments = @(
        'enc',
        '-d',
        '-aes-256-cbc',
        '-saltlen', '16',
        '-pbkdf2',
        '-iter', '600000',
        '-md', 'sha256',
        '-pass', 'env:MUTQAN_BACKUP_PASSPHRASE',
        '-in', $EncryptedPath,
        '-out', $PlainPath
    )
    & $openSslPath @decryptArguments
    if ($LASTEXITCODE -ne 0 -or
        -not (Test-Path -LiteralPath $PlainPath -PathType Leaf) -or
        (Get-Item -LiteralPath $PlainPath).Length -eq 0) {
        throw "Decryption failed: $EncryptedPath"
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory)] [string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$invariantCulture = [Globalization.CultureInfo]::InvariantCulture
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ', $invariantCulture)
New-Item -ItemType Directory -Path $backupRootPath -Force | Out-Null
$backupDir = Join-Path $backupRootPath $stamp
New-Item -ItemType Directory -Path $backupDir | Out-Null

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$aclResult = & icacls.exe $backupDir /inheritance:r /grant:r "${currentIdentity}:(OI)(CI)F" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Unable to restrict backup directory ACL: $backupDir`n$($aclResult -join [Environment]::NewLine)"
}

$databasePlain = Join-Path $backupDir "mutqan-production-$stamp.dump.part"
$databaseEncrypted = Join-Path $backupDir "mutqan-production-$stamp.dump.enc"
$rolesPlain = Join-Path $backupDir "mutqan-production-roles-$stamp.sql.part"
$rolesEncrypted = Join-Path $backupDir "mutqan-production-roles-$stamp.sql.enc"
$sourceInventoryPath = Join-Path $backupDir "source-inventory-$stamp.json"
$targetInventoryPath = Join-Path $backupDir "restore-inventory-$stamp.json"
$manifestPath = Join-Path $backupDir "manifest-$stamp.json"
$manifestHashPath = Join-Path $backupDir "manifest-$stamp.sha256"
$restoreRoot = Join-Path $backupDir 'restore-cluster'
$restoreData = Join-Path $restoreRoot 'data'
$restoreDump = Join-Path $restoreRoot 'restore.dump'
$restoreRoles = Join-Path $restoreRoot 'roles.sql'
$restoreLog = Join-Path $backupDir "restore-postgres-$stamp.log"
$localPasswordFile = Join-Path $restoreRoot 'initdb-password.txt'
$restoreDatabase = 'mutqan_production_backup_restore'

$previousPgPassword = $env:PGPASSWORD
$previousPgSslMode = $env:PGSSLMODE
$previousBackupPassphrase = $env:MUTQAN_BACKUP_PASSPHRASE
$previousPgOptions = $env:PGOPTIONS
$serverStarted = $false
$localPassword = $null
$productionPasswordPlain = $null
$backupPassphrasePlain = $null
$backupStartedUtc = [DateTime]::UtcNow

try {
    & $tools.pg_isready --host=127.0.0.1 --port=$RestorePort | Out-Null
    if ($LASTEXITCODE -eq 0) {
        throw "Restore port $RestorePort is already occupied."
    }

    $productionPassword = Read-Host 'Enter the CURRENT Production database password (input is hidden)' -AsSecureString
    $backupPassphrase = Read-Host 'Create a backup-encryption passphrase of at least 16 characters (input is hidden)' -AsSecureString
    $backupPassphraseConfirmation = Read-Host 'Repeat the backup-encryption passphrase (input is hidden)' -AsSecureString
    $productionPasswordPlain = Convert-SecureStringToPlainText -SecureValue $productionPassword
    $backupPassphrasePlain = Convert-SecureStringToPlainText -SecureValue $backupPassphrase
    $backupPassphraseConfirmationPlain = Convert-SecureStringToPlainText -SecureValue $backupPassphraseConfirmation
    if ([string]::IsNullOrWhiteSpace($productionPasswordPlain)) {
        throw 'The Production database password cannot be empty.'
    }
    if ($backupPassphrasePlain.Length -lt 16) {
        throw 'The backup-encryption passphrase must contain at least 16 characters.'
    }
    if ($backupPassphrasePlain -cne $backupPassphraseConfirmationPlain) {
        throw 'The backup-encryption passphrases do not match.'
    }
    $backupPassphraseConfirmationPlain = $null

    $env:PGPASSWORD = $productionPasswordPlain
    $env:PGSSLMODE = $SourceSslMode
    $env:MUTQAN_BACKUP_PASSPHRASE = $backupPassphrasePlain

    $inventorySql = Get-InventorySql
    $sourceBeforeJson = Invoke-PsqlScalar -Sql $inventorySql -HostName $PoolerHost -Port $PoolerPort -UserName $sourceUserName -Database $SourceDatabase
    $sourceBefore = $sourceBeforeJson | ConvertFrom-Json
    if ([int64]$sourceBefore.custom_role_count -ne 0) {
        throw 'Custom database roles now exist; the reviewed restore-role bootstrap must be updated before continuing.'
    }

    $roleDumpArguments = @(
        "--host=$PoolerHost",
        "--port=$PoolerPort",
        "--username=$sourceUserName",
        "--database=$SourceDatabase",
        '--role=postgres',
        '--roles-only',
        '--quote-all-identifiers',
        '--no-role-passwords',
        '--no-comments',
        "--file=$rolesPlain"
    )
    & $tools.pg_dumpall @roleDumpArguments
    if ($LASTEXITCODE -ne 0 -or
        -not (Test-Path -LiteralPath $rolesPlain -PathType Leaf) -or
        (Get-Item -LiteralPath $rolesPlain).Length -eq 0) {
        throw 'Production role dump failed.'
    }

    $dumpArguments = @(
        "--host=$PoolerHost",
        "--port=$PoolerPort",
        "--username=$sourceUserName",
        "--dbname=$SourceDatabase",
        '--role=postgres',
        '--format=custom',
        '--compress=gzip:9',
        '--encoding=UTF8',
        '--large-objects',
        '--quote-all-identifiers',
        '--serializable-deferrable',
        '--lock-wait-timeout=15s',
        '--strict-names',
        '--no-publications',
        '--no-subscriptions',
        '--exclude-extension=pg_net',
        '--schema=auth',
        '--schema=storage',
        '--schema=internal',
        '--schema=pm_legacy_archive',
        '--schema=public',
        '--schema=supabase_migrations',
        "--file=$databasePlain"
    )
    & $tools.pg_dump @dumpArguments
    if ($LASTEXITCODE -ne 0 -or
        -not (Test-Path -LiteralPath $databasePlain -PathType Leaf) -or
        (Get-Item -LiteralPath $databasePlain).Length -eq 0) {
        throw 'Production database dump failed.'
    }

    $sourceAfterJson = Invoke-PsqlScalar -Sql $inventorySql -HostName $PoolerHost -Port $PoolerPort -UserName $sourceUserName -Database $SourceDatabase
    $sourceAfter = $sourceAfterJson | ConvertFrom-Json
    Compare-Inventory -Source $sourceBefore -Target $sourceAfter -Context 'Production changed during backup'
    [IO.File]::WriteAllText(
        $sourceInventoryPath,
        ($sourceAfter | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )

    $databasePlainHash = Get-Sha256 -Path $databasePlain
    $rolesPlainHash = Get-Sha256 -Path $rolesPlain
    Protect-Artifact -PlainPath $databasePlain -EncryptedPath $databaseEncrypted
    Protect-Artifact -PlainPath $rolesPlain -EncryptedPath $rolesEncrypted
    $databaseEncryptedHash = Get-Sha256 -Path $databaseEncrypted
    $rolesEncryptedHash = Get-Sha256 -Path $rolesEncrypted

    Remove-ScopedItem -Path $databasePlain -Parent $backupDir
    Remove-ScopedItem -Path $rolesPlain -Parent $backupDir

    New-Item -ItemType Directory -Path $restoreRoot | Out-Null
    $randomBytes = [byte[]]::new(48)
    $randomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $randomNumberGenerator.GetBytes($randomBytes)
    } finally {
        $randomNumberGenerator.Dispose()
    }
    $localPassword = [Convert]::ToBase64String($randomBytes)
    [IO.File]::WriteAllText(
        $localPasswordFile,
        $localPassword + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )
    $initDbArguments = @(
        "--pgdata=$restoreData",
        '--username=postgres',
        '--auth-host=scram-sha-256',
        '--auth-local=scram-sha-256',
        "--pwfile=$localPasswordFile",
        '--encoding=UTF8',
        '--locale=C',
        '--data-checksums'
    )
    & $tools.initdb @initDbArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to initialize the isolated PostgreSQL 17 cluster.'
    }
    Remove-ScopedItem -Path $localPasswordFile -Parent $backupDir

    $env:PGPASSWORD = $localPassword
    $env:PGSSLMODE = 'disable'
    $productionPasswordPlain = $null

    $startArguments = @(
        "--pgdata=$restoreData",
        "--log=$restoreLog",
        "--options=-p $RestorePort -h 127.0.0.1",
        '--wait',
        'start'
    )
    & $tools.pg_ctl @startArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to start the isolated PostgreSQL 17 cluster.'
    }
    $serverStarted = $true

    $bootstrapSql = @'
DO $bootstrap$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'authenticator',
    'dashboard_user',
    'pgbouncer',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_functions_admin',
    'supabase_replication_admin',
    'supabase_storage_admin'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
    END IF;
  END LOOP;
END
$bootstrap$;
ALTER ROLE service_role BYPASSRLS;
'@
    [void](Invoke-PsqlScalar -Sql $bootstrapSql -HostName '127.0.0.1' -Port $RestorePort -UserName 'postgres' -Database 'postgres')

    $createDatabaseArguments = @(
        '--host=127.0.0.1',
        "--port=$RestorePort",
        '--username=postgres',
        '--owner=postgres',
        $restoreDatabase
    )
    & $tools.createdb @createDatabaseArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to create the isolated restore database.'
    }

    $extensionBootstrapSql = @'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION postgres;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
'@
    [void](Invoke-PsqlScalar -Sql $extensionBootstrapSql -HostName '127.0.0.1' -Port $RestorePort -UserName 'postgres' -Database $restoreDatabase)

    Unprotect-Artifact -EncryptedPath $databaseEncrypted -PlainPath $restoreDump
    if ((Get-Sha256 -Path $restoreDump) -cne $databasePlainHash) {
        throw 'Decrypted database dump SHA-256 mismatch.'
    }
    Unprotect-Artifact -EncryptedPath $rolesEncrypted -PlainPath $restoreRoles
    if ((Get-Sha256 -Path $restoreRoles) -cne $rolesPlainHash) {
        throw 'Decrypted role dump SHA-256 mismatch.'
    }

    $env:PGOPTIONS = '-c check_function_bodies=off'
    $restoreArguments = @(
        '--host=127.0.0.1',
        "--port=$RestorePort",
        '--username=postgres',
        "--dbname=$restoreDatabase",
        '--exit-on-error',
        '--single-transaction',
        $restoreDump
    )
    & $tools.pg_restore @restoreArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'The isolated PostgreSQL 17 restore failed.'
    }
    if ($null -eq $previousPgOptions) {
        Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
    } else {
        $env:PGOPTIONS = $previousPgOptions
    }

    $targetInventoryJson = Invoke-PsqlScalar -Sql $inventorySql -HostName '127.0.0.1' -Port $RestorePort -UserName 'postgres' -Database $restoreDatabase
    $targetInventory = $targetInventoryJson | ConvertFrom-Json
    Compare-Inventory -Source $sourceAfter -Target $targetInventory -Context 'Restored PostgreSQL 17 database'
    [IO.File]::WriteAllText(
        $targetInventoryPath,
        ($targetInventory | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )

    $backupFinishedUtc = [DateTime]::UtcNow
    $manifest = [ordered]@{
        gate_status = 'PASS'
        source_project_ref = $ProjectRef
        source_database_host = $PoolerHost
        source_database_port = $PoolerPort
        source_database_name = $SourceDatabase
        source_database_user = $sourceUserName
        backup_started_utc = $backupStartedUtc.ToString('o', $invariantCulture)
        backup_finished_utc = $backupFinishedUtc.ToString('o', $invariantCulture)
        pg_tools_version = $postgresVersion
        encryption = 'OpenSSL AES-256-CBC; PBKDF2-HMAC-SHA256; 600000 iterations; 16-byte salt'
        selected_schemas = @('auth','storage','internal','pm_legacy_archive','public','supabase_migrations')
        excluded_managed_schemas = @('extensions','graphql','graphql_public','net','realtime','vault')
        excluded_extension = @('pg_net')
        role_password_hashes_included = $false
        storage_objects_included = $false
        artifacts = @(
            [ordered]@{
                path = [IO.Path]::GetFileName($databaseEncrypted)
                bytes = (Get-Item -LiteralPath $databaseEncrypted).Length
                encrypted_sha256 = $databaseEncryptedHash
                decrypted_sha256 = $databasePlainHash
            },
            [ordered]@{
                path = [IO.Path]::GetFileName($rolesEncrypted)
                bytes = (Get-Item -LiteralPath $rolesEncrypted).Length
                encrypted_sha256 = $rolesEncryptedHash
                decrypted_sha256 = $rolesPlainHash
            },
            [ordered]@{
                path = [IO.Path]::GetFileName($sourceInventoryPath)
                bytes = (Get-Item -LiteralPath $sourceInventoryPath).Length
                sha256 = Get-Sha256 -Path $sourceInventoryPath
            },
            [ordered]@{
                path = [IO.Path]::GetFileName($targetInventoryPath)
                bytes = (Get-Item -LiteralPath $targetInventoryPath).Length
                sha256 = Get-Sha256 -Path $targetInventoryPath
            }
        )
        restore = [ordered]@{
            postgres_major = 17
            isolated_host = '127.0.0.1'
            isolated_port = $RestorePort
            database = $restoreDatabase
            inventory_match = $true
        }
        coverage_exclusions = @(
            'Storage object bytes; database metadata only',
            'Supabase Auth/SMTP/provider configuration and email templates',
            'API, JWT, service-role, webhook, Edge Function, and Vercel secret values',
            'Edge Function deployed source and runtime configuration',
            'Custom domains, DNS, network restrictions, and platform settings',
            'Managed realtime/net/vault operational schemas and replication state',
            'Database role password hashes'
        )
    }
    [IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )
    [IO.File]::WriteAllText(
        $manifestHashPath,
        "$(Get-Sha256 -Path $manifestPath)  $([IO.Path]::GetFileName($manifestPath))$([Environment]::NewLine)",
        [Text.UTF8Encoding]::new($false)
    )

    Write-Host 'PRODUCTION LOGICAL BACKUP GATE: PASS'
    Write-Host "Backup directory: $backupDir"
    Write-Host "Manifest: $manifestPath"
} finally {
    if ($serverStarted) {
        & $tools.pg_ctl --pgdata=$restoreData --mode=fast --wait stop | Out-Null
    }
    Remove-ScopedItem -Path $databasePlain -Parent $backupDir
    Remove-ScopedItem -Path $rolesPlain -Parent $backupDir
    Remove-ScopedItem -Path $restoreRoot -Parent $backupDir -Recurse

    if ($null -eq $previousPgPassword) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    } else {
        $env:PGPASSWORD = $previousPgPassword
    }
    if ($null -eq $previousPgSslMode) {
        Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
    } else {
        $env:PGSSLMODE = $previousPgSslMode
    }
    if ($null -eq $previousBackupPassphrase) {
        Remove-Item Env:MUTQAN_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
    } else {
        $env:MUTQAN_BACKUP_PASSPHRASE = $previousBackupPassphrase
    }
    if ($null -eq $previousPgOptions) {
        Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
    } else {
        $env:PGOPTIONS = $previousPgOptions
    }

    $productionPasswordPlain = $null
    $backupPassphrasePlain = $null
    $localPassword = $null
}
