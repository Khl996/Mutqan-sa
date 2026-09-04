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
    [int]$RestorePort = 55440,
    [switch]$GenerateProtectedPassphrase,
    [string]$RecoveryKeyRoot = (Join-Path $env:LOCALAPPDATA 'Mutqan\RecoveryKeys')
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
$recoveryKeyRootPath = [IO.Path]::GetFullPath($RecoveryKeyRoot).TrimEnd(
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
if ($GenerateProtectedPassphrase) {
    $recoveryKeyPrefix = $recoveryKeyRootPath + [IO.Path]::DirectorySeparatorChar
    if ($recoveryKeyRootPath.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
        $recoveryKeyPrefix.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'RecoveryKeyRoot must be outside the Git repository.'
    }
    if ($recoveryKeyRootPath.Equals($backupRootPath, [StringComparison]::OrdinalIgnoreCase) -or
        $recoveryKeyPrefix.StartsWith($backupPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        $backupPrefix.StartsWith($recoveryKeyPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'RecoveryKeyRoot must be separate from BackupRoot.'
    }
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
    Assert-NoReparsePoint -Path $parentPath
    Assert-NoReparsePoint -Path $candidatePath
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

function Assert-NoReparsePoint {
    param([Parameter(Mandatory)] [string]$Path)

    $fullPath = [IO.Path]::GetFullPath($Path)
    $pathRoot = [IO.Path]::GetPathRoot($fullPath)
    $currentPath = $pathRoot
    $relativePath = $fullPath.Substring($pathRoot.Length)
    foreach ($segment in $relativePath.Split(
        @([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar),
        [StringSplitOptions]::RemoveEmptyEntries
    )) {
        $currentPath = Join-Path $currentPath $segment
        if (Test-Path -LiteralPath $currentPath) {
            $item = Get-Item -LiteralPath $currentPath -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Reparse points are not allowed in protected artifact paths: $currentPath"
            }
        }
    }
}

function Convert-SecureStringToPlainText {
    param([Parameter(Mandatory)] [Security.SecureString]$SecureValue)
    return ([Net.NetworkCredential]::new('', $SecureValue)).Password
}

function Write-DpapiRecoveryKey {
    param(
        [Parameter(Mandatory)] [byte[]]$PassphraseBytes,
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$ProjectRefValue,
        [Parameter(Mandatory)] [string]$CreatedUtc,
        [Parameter(Mandatory)] [string]$Identity
    )

    $entropyContext = "Mutqan:ProductionLogicalBackupGate:$ProjectRefValue:v2"
    $partPath = "$Path.part"
    [byte[]]$entropyBytes = $null
    [byte[]]$protectedBytes = $null
    [byte[]]$roundTripProtectedBytes = $null
    [byte[]]$roundTripPlainBytes = $null
    [byte[]]$recordBytes = $null
    try {
        Assert-NoReparsePoint -Path (Split-Path -Parent $Path)
        Assert-NoReparsePoint -Path $partPath
        $entropyBytes = [Text.Encoding]::UTF8.GetBytes($entropyContext)
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
            $PassphraseBytes,
            $entropyBytes,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $record = [ordered]@{
            format = 'mutqan-backup-recovery-key-v2'
            project_ref = $ProjectRefValue
            created_utc = $CreatedUtc
            protection = 'Windows DPAPI CurrentUser'
            entropy_context = $entropyContext
            protected_random_bytes_base64 = [Convert]::ToBase64String($protectedBytes)
        }
        $recordBytes = [Text.UTF8Encoding]::new($false).GetBytes(
            ($record | ConvertTo-Json -Depth 4) + [Environment]::NewLine
        )
        $keyStream = [IO.File]::Open(
            $partPath,
            [IO.FileMode]::CreateNew,
            [IO.FileAccess]::Write,
            [IO.FileShare]::None
        )
        try {
            $keyStream.Write($recordBytes, 0, $recordBytes.Length)
            $keyStream.Flush($true)
        } finally {
            $keyStream.Dispose()
        }

        $aclResult = & icacls.exe $partPath /inheritance:r /grant:r "${Identity}:F" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to restrict recovery-key ACL: $partPath`n$($aclResult -join [Environment]::NewLine)"
        }

        $storedRecord = Get-Content -LiteralPath $partPath -Raw | ConvertFrom-Json
        $roundTripProtectedBytes = [Convert]::FromBase64String($storedRecord.protected_random_bytes_base64)
        $roundTripPlainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            $roundTripProtectedBytes,
            $entropyBytes,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        if (-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals(
            $PassphraseBytes,
            $roundTripPlainBytes
        )) {
            throw 'The DPAPI recovery-key round-trip check failed.'
        }
        Assert-NoReparsePoint -Path $partPath
        Move-Item -LiteralPath $partPath -Destination $Path
    } finally {
        if (Test-Path -LiteralPath $partPath) {
            Remove-Item -LiteralPath $partPath -Force
        }
        foreach ($buffer in @($entropyBytes, $protectedBytes, $roundTripProtectedBytes, $roundTripPlainBytes, $recordBytes)) {
            if ($null -ne $buffer) {
                [Array]::Clear($buffer, 0, $buffer.Length)
            }
        }
    }
}

function Read-DpapiRecoveryPassphrase {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$ExpectedProjectRef
    )

    $record = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ($record.project_ref -cne $ExpectedProjectRef -or
        $record.protection -cne 'Windows DPAPI CurrentUser') {
        throw 'The DPAPI recovery-key envelope does not match this backup.'
    }
    [byte[]]$entropyBytes = $null
    [byte[]]$protectedBytes = $null
    [byte[]]$plainBytes = $null
    try {
        $entropyBytes = [Text.Encoding]::UTF8.GetBytes($record.entropy_context)
        switch ($record.format) {
            'mutqan-backup-recovery-key-v1' {
                $protectedBytes = [Convert]::FromBase64String($record.protected_passphrase_base64)
            }
            'mutqan-backup-recovery-key-v2' {
                $protectedBytes = [Convert]::FromBase64String($record.protected_random_bytes_base64)
            }
            default {
                throw "Unsupported DPAPI recovery-key format: $($record.format)"
            }
        }
        $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            $protectedBytes,
            $entropyBytes,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        if ($record.format -ceq 'mutqan-backup-recovery-key-v1') {
            return [Text.Encoding]::UTF8.GetString($plainBytes)
        }
        return [Convert]::ToBase64String($plainBytes)
    } finally {
        foreach ($buffer in @($entropyBytes, $protectedBytes, $plainBytes)) {
            if ($null -ne $buffer) {
                [Array]::Clear($buffer, 0, $buffer.Length)
            }
        }
    }
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

function Invoke-OpenSslWithPassphrase {
    param(
        [Parameter(Mandatory)] [string[]]$Arguments,
        [Parameter(Mandatory)] [string]$Passphrase
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $openSslPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($argument in $Arguments) {
        [void]$startInfo.ArgumentList.Add($argument)
    }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        [void]$process.Start()
        $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
        $standardErrorTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.NewLine = "`n"
        $process.StandardInput.WriteLine($Passphrase)
        $process.StandardInput.Close()
        $process.WaitForExit()
        [void]$standardOutputTask.GetAwaiter().GetResult()
        [void]$standardErrorTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) {
            throw 'OpenSSL artifact protection failed.'
        }
    } finally {
        $process.Dispose()
    }
}

function Protect-Artifact {
    param(
        [Parameter(Mandatory)] [string]$PlainPath,
        [Parameter(Mandatory)] [string]$EncryptedPath,
        [Parameter(Mandatory)] [string]$Passphrase
    )

    $encryptArguments = @(
        'enc',
        '-aes-256-cbc',
        '-salt',
        '-saltlen', '16',
        '-pbkdf2',
        '-iter', '600000',
        '-md', 'sha256',
        '-pass', 'stdin',
        '-in', $PlainPath,
        '-out', $EncryptedPath
    )
    Invoke-OpenSslWithPassphrase -Arguments $encryptArguments -Passphrase $Passphrase
    if (-not (Test-Path -LiteralPath $EncryptedPath -PathType Leaf) -or
        (Get-Item -LiteralPath $EncryptedPath).Length -eq 0) {
        throw "Encryption failed: $EncryptedPath"
    }
}

function Unprotect-Artifact {
    param(
        [Parameter(Mandatory)] [string]$EncryptedPath,
        [Parameter(Mandatory)] [string]$PlainPath,
        [Parameter(Mandatory)] [string]$Passphrase
    )

    $decryptArguments = @(
        'enc',
        '-d',
        '-aes-256-cbc',
        '-saltlen', '16',
        '-pbkdf2',
        '-iter', '600000',
        '-md', 'sha256',
        '-pass', 'stdin',
        '-in', $EncryptedPath,
        '-out', $PlainPath
    )
    Invoke-OpenSslWithPassphrase -Arguments $decryptArguments -Passphrase $Passphrase
    if (-not (Test-Path -LiteralPath $PlainPath -PathType Leaf) -or
        (Get-Item -LiteralPath $PlainPath).Length -eq 0) {
        throw "Decryption failed: $EncryptedPath"
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory)] [string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-Utf8FileCreateNew {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Content
    )

    [byte[]]$contentBytes = $null
    try {
        Assert-NoReparsePoint -Path (Split-Path -Parent $Path)
        Assert-NoReparsePoint -Path $Path
        $contentBytes = [Text.UTF8Encoding]::new($false).GetBytes($Content)
        $stream = [IO.File]::Open(
            $Path,
            [IO.FileMode]::CreateNew,
            [IO.FileAccess]::Write,
            [IO.FileShare]::None
        )
        try {
            $stream.Write($contentBytes, 0, $contentBytes.Length)
            $stream.Flush($true)
        } finally {
            $stream.Dispose()
        }
    } finally {
        if ($null -ne $contentBytes) {
            [Array]::Clear($contentBytes, 0, $contentBytes.Length)
        }
    }
}

Assert-NoReparsePoint -Path $backupRootPath
if ($GenerateProtectedPassphrase) {
    Assert-NoReparsePoint -Path $recoveryKeyRootPath
}
$invariantCulture = [Globalization.CultureInfo]::InvariantCulture
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ', $invariantCulture)
New-Item -ItemType Directory -Path $backupRootPath -Force | Out-Null
Assert-NoReparsePoint -Path $backupRootPath
$backupDir = Join-Path $backupRootPath $stamp
New-Item -ItemType Directory -Path $backupDir | Out-Null

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$aclResult = & icacls.exe $backupDir /inheritance:r /grant:r "${currentIdentity}:(OI)(CI)F" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Unable to restrict backup directory ACL: $backupDir`n$($aclResult -join [Environment]::NewLine)"
}
if ($GenerateProtectedPassphrase) {
    New-Item -ItemType Directory -Path $recoveryKeyRootPath -Force | Out-Null
    Assert-NoReparsePoint -Path $recoveryKeyRootPath
    $aclResult = & icacls.exe $recoveryKeyRootPath /inheritance:r /grant:r "${currentIdentity}:(OI)(CI)F" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to restrict recovery-key directory ACL: $recoveryKeyRootPath`n$($aclResult -join [Environment]::NewLine)"
    }
}

$databasePlain = Join-Path $backupDir "mutqan-production-$stamp.dump.part"
$databaseEncrypted = Join-Path $backupDir "mutqan-production-$stamp.dump.enc"
$rolesPlain = Join-Path $backupDir "mutqan-production-roles-$stamp.sql.part"
$rolesEncrypted = Join-Path $backupDir "mutqan-production-roles-$stamp.sql.enc"
$sourceInventoryPath = Join-Path $backupDir "source-inventory-$stamp.json"
$targetInventoryPath = Join-Path $backupDir "restore-inventory-$stamp.json"
$manifestPath = Join-Path $backupDir "manifest-$stamp.json"
$manifestHashPath = Join-Path $backupDir "manifest-$stamp.sha256"
$manifestPartPath = "$manifestPath.part"
$manifestHashPartPath = "$manifestHashPath.part"
$restoreRoot = Join-Path $backupDir 'restore-cluster'
$restoreData = Join-Path $restoreRoot 'data'
$restoreDump = Join-Path $restoreRoot 'restore.dump'
$restoreRoles = Join-Path $restoreRoot 'roles.sql'
$restoreLog = Join-Path $backupDir "restore-postgres-$stamp.log"
$localPasswordFile = Join-Path $restoreRoot 'initdb-password.txt'
$restoreDatabase = 'mutqan_production_backup_restore'
$safeProjectRef = [regex]::Replace($ProjectRef, '[^A-Za-z0-9._-]', '_')
$recoveryKeyPath = if ($GenerateProtectedPassphrase) {
    Join-Path $recoveryKeyRootPath "mutqan-backup-$safeProjectRef-$stamp.dpapi.json"
} else {
    $null
}
$recoveryKeyPartPath = if ($GenerateProtectedPassphrase) { "$recoveryKeyPath.part" } else { $null }

$previousPgPassword = $env:PGPASSWORD
$previousPgSslMode = $env:PGSSLMODE
$previousPgOptions = $env:PGOPTIONS
$serverStarted = $false
$backupWorkComplete = $false
$localPassword = $null
$productionPasswordPlain = $null
$backupPassphrasePlain = $null
$backupPassphraseConfirmationPlain = $null
$backupStartedUtc = [DateTime]::UtcNow

try {
    & $tools.pg_isready --host=127.0.0.1 --port=$RestorePort | Out-Null
    if ($LASTEXITCODE -eq 0) {
        throw "Restore port $RestorePort is already occupied."
    }

    $productionPassword = Read-Host 'Enter the CURRENT Production database password (input is hidden)' -AsSecureString
    $productionPasswordPlain = Convert-SecureStringToPlainText -SecureValue $productionPassword
    if ([string]::IsNullOrWhiteSpace($productionPasswordPlain)) {
        throw 'The Production database password cannot be empty.'
    }

    if ($GenerateProtectedPassphrase) {
        $passphraseBytes = [byte[]]::new(48)
        $passphraseGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $passphraseGenerator.GetBytes($passphraseBytes)
            $backupPassphrasePlain = [Convert]::ToBase64String($passphraseBytes)
            Write-DpapiRecoveryKey `
                -PassphraseBytes $passphraseBytes `
                -Path $recoveryKeyPath `
                -ProjectRefValue $ProjectRef `
                -CreatedUtc $backupStartedUtc.ToString('o', $invariantCulture) `
                -Identity $currentIdentity
        } finally {
            $passphraseGenerator.Dispose()
            [Array]::Clear($passphraseBytes, 0, $passphraseBytes.Length)
        }
    } else {
        $backupPassphrase = Read-Host 'Create a backup-encryption passphrase of at least 16 characters (input is hidden)' -AsSecureString
        $backupPassphraseConfirmation = Read-Host 'Repeat the backup-encryption passphrase (input is hidden)' -AsSecureString
        $backupPassphrasePlain = Convert-SecureStringToPlainText -SecureValue $backupPassphrase
        $backupPassphraseConfirmationPlain = Convert-SecureStringToPlainText -SecureValue $backupPassphraseConfirmation
        if ($backupPassphrasePlain.Length -lt 16) {
            throw 'The backup-encryption passphrase must contain at least 16 characters.'
        }
        if ($backupPassphrasePlain -cne $backupPassphraseConfirmationPlain) {
            throw 'The backup-encryption passphrases do not match.'
        }
        $backupPassphraseConfirmationPlain = $null
    }

    $env:PGPASSWORD = $productionPasswordPlain
    $env:PGSSLMODE = $SourceSslMode

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
    $productionPasswordPlain = $null

    $databasePlainHash = Get-Sha256 -Path $databasePlain
    $rolesPlainHash = Get-Sha256 -Path $rolesPlain
    Protect-Artifact -PlainPath $databasePlain -EncryptedPath $databaseEncrypted -Passphrase $backupPassphrasePlain
    Protect-Artifact -PlainPath $rolesPlain -EncryptedPath $rolesEncrypted -Passphrase $backupPassphrasePlain
    $databaseEncryptedHash = Get-Sha256 -Path $databaseEncrypted
    $rolesEncryptedHash = Get-Sha256 -Path $rolesEncrypted

    Remove-ScopedItem -Path $databasePlain -Parent $backupDir
    Remove-ScopedItem -Path $rolesPlain -Parent $backupDir
    if ($GenerateProtectedPassphrase) {
        $backupPassphrasePlain = $null
    }

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

    if ($GenerateProtectedPassphrase) {
        $backupPassphrasePlain = Read-DpapiRecoveryPassphrase `
            -Path $recoveryKeyPath `
            -ExpectedProjectRef $ProjectRef
    }
    Unprotect-Artifact `
        -EncryptedPath $databaseEncrypted `
        -PlainPath $restoreDump `
        -Passphrase $backupPassphrasePlain
    if ((Get-Sha256 -Path $restoreDump) -cne $databasePlainHash) {
        throw 'Decrypted database dump SHA-256 mismatch.'
    }
    Unprotect-Artifact `
        -EncryptedPath $rolesEncrypted `
        -PlainPath $restoreRoles `
        -Passphrase $backupPassphrasePlain
    if ((Get-Sha256 -Path $restoreRoles) -cne $rolesPlainHash) {
        throw 'Decrypted role dump SHA-256 mismatch.'
    }
    $backupPassphrasePlain = $null

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

    if ($serverStarted) {
        & $tools.pg_ctl --pgdata=$restoreData --mode=fast --wait stop | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to stop the isolated PostgreSQL 17 restore cluster.'
        }
        $serverStarted = $false
    }
    Remove-ScopedItem -Path $restoreRoot -Parent $backupDir -Recurse
    if (Test-Path -LiteralPath $restoreRoot) {
        throw 'The isolated restore cluster was not removed before manifest finalization.'
    }
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
    if ($null -eq $previousPgOptions) {
        Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
    } else {
        $env:PGOPTIONS = $previousPgOptions
    }
    $productionPasswordPlain = $null
    $backupPassphrasePlain = $null
    $backupPassphraseConfirmationPlain = $null
    $localPassword = $null

    $backupFinishedUtc = [DateTime]::UtcNow
    $passphraseCustody = if ($GenerateProtectedPassphrase) {
        [ordered]@{
            mode = 'windows_dpapi_current_user'
            format_version = 2
            scope = 'CurrentUser'
            recovery_key_path = $recoveryKeyPath
            recovery_key_file_name = [IO.Path]::GetFileName($recoveryKeyPath)
            recovery_key_bytes = (Get-Item -LiteralPath $recoveryKeyPath).Length
            recovery_key_sha256 = Get-Sha256 -Path $recoveryKeyPath
            recovery_key_file_sha256 = Get-Sha256 -Path $recoveryKeyPath
            round_trip_verified = $true
            plaintext_logged = $false
            independent_off_machine_custody_required = $true
        }
    } else {
        [ordered]@{
            mode = 'operator_supplied'
            recovery_key_path = $null
            plaintext_logged = $false
            independent_off_machine_custody_required = $true
        }
    }
    $manifest = [ordered]@{
        gate_status = 'PASS'
        source_project_ref = $ProjectRef
        source_database_host = $PoolerHost
        source_database_port = $PoolerPort
        source_database_name = $SourceDatabase
        source_database_user = $sourceUserName
        operator_windows_identity = $currentIdentity
        source_operation = 'read-only logical dump and catalog inventory'
        backup_started_utc = $backupStartedUtc.ToString('o', $invariantCulture)
        backup_finished_utc = $backupFinishedUtc.ToString('o', $invariantCulture)
        pg_tools_version = $postgresVersion
        encryption = 'OpenSSL AES-256-CBC; PBKDF2-HMAC-SHA256; 600000 iterations; 16-byte salt'
        passphrase_custody = $passphraseCustody
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
    $backupWorkComplete = $true
} finally {
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
    if ($null -eq $previousPgOptions) {
        Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
    } else {
        $env:PGOPTIONS = $previousPgOptions
    }

    $productionPasswordPlain = $null
    $backupPassphrasePlain = $null
    $backupPassphraseConfirmationPlain = $null
    $localPassword = $null

    $cleanupFailures = [Collections.Generic.List[string]]::new()
    if (-not $backupWorkComplete) {
        if ($GenerateProtectedPassphrase -and $null -ne $recoveryKeyPath) {
            foreach ($keyArtifactPath in @($recoveryKeyPartPath, $recoveryKeyPath)) {
                try {
                    Remove-ScopedItem -Path $keyArtifactPath -Parent $recoveryKeyRootPath
                } catch {
                    [void]$cleanupFailures.Add("recovery key: $keyArtifactPath")
                }
            }
        }
        foreach ($manifestArtifactPath in @(
            $manifestPartPath,
            $manifestHashPartPath,
            $manifestHashPath,
            $manifestPath
        )) {
            try {
                Remove-ScopedItem -Path $manifestArtifactPath -Parent $backupDir
            } catch {
                [void]$cleanupFailures.Add("manifest artifact: $manifestArtifactPath")
            }
        }
    }
    if ($serverStarted) {
        try {
            & $tools.pg_ctl --pgdata=$restoreData --mode=fast --wait stop | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw 'pg_ctl stop failed.'
            }
            $serverStarted = $false
        } catch {
            [void]$cleanupFailures.Add("restore server: $restoreData")
        }
    }
    foreach ($cleanupItem in @(
        [pscustomobject]@{ Path = $databasePlain; Recurse = $false },
        [pscustomobject]@{ Path = $rolesPlain; Recurse = $false },
        [pscustomobject]@{ Path = $restoreRoot; Recurse = $true }
    )) {
        try {
            Remove-ScopedItem `
                -Path $cleanupItem.Path `
                -Parent $backupDir `
                -Recurse:$cleanupItem.Recurse
        } catch {
            [void]$cleanupFailures.Add("temporary artifact: $($cleanupItem.Path)")
        }
    }
    if ($cleanupFailures.Count -gt 0) {
        if ($GenerateProtectedPassphrase -and $null -ne $recoveryKeyPath) {
            foreach ($keyArtifactPath in @($recoveryKeyPartPath, $recoveryKeyPath)) {
                try {
                    Remove-ScopedItem -Path $keyArtifactPath -Parent $recoveryKeyRootPath
                } catch {
                    [void]$cleanupFailures.Add("recovery-key revocation: $keyArtifactPath")
                }
            }
        }
        foreach ($manifestArtifactPath in @(
            $manifestPartPath,
            $manifestHashPartPath,
            $manifestHashPath,
            $manifestPath
        )) {
            try {
                Remove-ScopedItem -Path $manifestArtifactPath -Parent $backupDir
            } catch {
                [void]$cleanupFailures.Add("manifest revocation: $manifestArtifactPath")
            }
        }
        throw "Backup-gate cleanup failed for: $($cleanupFailures -join '; ')"
    }
}

try {
    Write-Utf8FileCreateNew `
        -Path $manifestPartPath `
        -Content (($manifest | ConvertTo-Json -Depth 12) + [Environment]::NewLine)
    Write-Utf8FileCreateNew `
        -Path $manifestHashPartPath `
        -Content "$(Get-Sha256 -Path $manifestPartPath)  $([IO.Path]::GetFileName($manifestPath))$([Environment]::NewLine)"
    Move-Item -LiteralPath $manifestHashPartPath -Destination $manifestHashPath
    Move-Item -LiteralPath $manifestPartPath -Destination $manifestPath
} catch {
    $publicationCleanupFailures = [Collections.Generic.List[string]]::new()
    foreach ($manifestArtifactPath in @(
        $manifestPartPath,
        $manifestHashPartPath,
        $manifestHashPath,
        $manifestPath
    )) {
        try {
            Remove-ScopedItem -Path $manifestArtifactPath -Parent $backupDir
        } catch {
            [void]$publicationCleanupFailures.Add("manifest artifact: $manifestArtifactPath")
        }
    }
    if ($GenerateProtectedPassphrase -and $null -ne $recoveryKeyPath) {
        foreach ($keyArtifactPath in @($recoveryKeyPartPath, $recoveryKeyPath)) {
            try {
                Remove-ScopedItem -Path $keyArtifactPath -Parent $recoveryKeyRootPath
            } catch {
                [void]$publicationCleanupFailures.Add("recovery key: $keyArtifactPath")
            }
        }
    }
    if ($publicationCleanupFailures.Count -gt 0) {
        throw "Manifest publication failed and cleanup also failed for: $($publicationCleanupFailures -join '; ')"
    }
    throw
}

Write-Host 'PRODUCTION LOGICAL BACKUP GATE: PASS'
Write-Host "Backup directory: $backupDir"
Write-Host "Manifest: $manifestPath"
if ($GenerateProtectedPassphrase) {
    Write-Host "DPAPI recovery-key file: $recoveryKeyPath"
    Write-Host 'Independent off-machine recovery-key custody is still required before Production DDL.'
}
