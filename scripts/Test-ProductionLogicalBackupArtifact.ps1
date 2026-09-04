[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$ManifestPath,
    [string]$OpenSsl = 'C:\Program Files\Git\usr\bin\openssl.exe'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Sha256 {
    param([Parameter(Mandatory)] [string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
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
                throw "Reparse points are not allowed in backup artifact paths: $currentPath"
            }
        }
    }
}

function Assert-ChildPath {
    param(
        [Parameter(Mandatory)] [string]$Candidate,
        [Parameter(Mandatory)] [string]$Parent
    )

    $candidatePath = [IO.Path]::GetFullPath($Candidate)
    $parentPrefix = [IO.Path]::GetFullPath($Parent).TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    ) + [IO.Path]::DirectorySeparatorChar
    if (-not $candidatePath.StartsWith($parentPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing a path outside the backup directory: $candidatePath"
    }
    Assert-NoReparsePoint -Path $Parent
    Assert-NoReparsePoint -Path $candidatePath
    return $candidatePath
}

function Invoke-OpenSslWithPassphrase {
    param(
        [Parameter(Mandatory)] [string]$Executable,
        [Parameter(Mandatory)] [string[]]$Arguments,
        [Parameter(Mandatory)] [string]$Passphrase
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
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
            throw 'OpenSSL artifact verification failed.'
        }
    } finally {
        $process.Dispose()
    }
}

Assert-NoReparsePoint -Path $ManifestPath
$resolvedManifestPath = (Resolve-Path -LiteralPath $ManifestPath).Path
$backupDirectory = Split-Path -Parent $resolvedManifestPath
$openSslPath = (Resolve-Path -LiteralPath $OpenSsl).Path
$manifest = Get-Content -LiteralPath $resolvedManifestPath -Raw | ConvertFrom-Json

if ($manifest.gate_status -cne 'PASS' -or -not $manifest.restore.inventory_match) {
    throw 'The supplied manifest is not a completed PASS artifact.'
}
if ($manifest.passphrase_custody.mode -cne 'windows_dpapi_current_user') {
    throw 'The supplied manifest does not use the reviewed DPAPI custody mode.'
}

$manifestHashPath = [IO.Path]::ChangeExtension($resolvedManifestPath, '.sha256')
if (-not (Test-Path -LiteralPath $manifestHashPath -PathType Leaf)) {
    throw 'The manifest SHA-256 sidecar is missing.'
}
$expectedManifestHash = ((Get-Content -LiteralPath $manifestHashPath -Raw).Trim() -split '\s+')[0]
$actualManifestHash = Get-Sha256 -Path $resolvedManifestPath
if ($expectedManifestHash -cne $actualManifestHash) {
    throw 'Manifest SHA-256 mismatch.'
}

foreach ($artifact in $manifest.artifacts) {
    $artifactPath = Assert-ChildPath -Candidate (Join-Path $backupDirectory $artifact.path) -Parent $backupDirectory
    if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
        throw "A recorded artifact is missing: $($artifact.path)"
    }
    if ((Get-Item -LiteralPath $artifactPath).Length -ne [int64]$artifact.bytes) {
        throw "Artifact byte-size mismatch: $($artifact.path)"
    }
    $encryptedHashProperty = $artifact.PSObject.Properties['encrypted_sha256']
    $expectedArtifactHash = if ($null -ne $encryptedHashProperty) {
        $encryptedHashProperty.Value
    } else {
        $artifact.sha256
    }
    if ((Get-Sha256 -Path $artifactPath) -cne $expectedArtifactHash) {
        throw "Artifact SHA-256 mismatch: $($artifact.path)"
    }
}

$sourceInventoryArtifact = $manifest.artifacts | Where-Object path -Like 'source-inventory-*'
$restoreInventoryArtifact = $manifest.artifacts | Where-Object path -Like 'restore-inventory-*'
if ($null -eq $sourceInventoryArtifact -or $null -eq $restoreInventoryArtifact) {
    throw 'The source or restore inventory artifact is missing from the manifest.'
}
$sourceInventoryPath = Assert-ChildPath -Candidate (Join-Path $backupDirectory $sourceInventoryArtifact.path) -Parent $backupDirectory
$restoreInventoryPath = Assert-ChildPath -Candidate (Join-Path $backupDirectory $restoreInventoryArtifact.path) -Parent $backupDirectory
$sourceInventory = Get-Content -LiteralPath $sourceInventoryPath -Raw | ConvertFrom-Json
$restoreInventory = Get-Content -LiteralPath $restoreInventoryPath -Raw | ConvertFrom-Json
$inventoryProperties = @(
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
$inventoryDifferences = foreach ($property in $inventoryProperties) {
    if ([string]$sourceInventory.$property -cne [string]$restoreInventory.$property) {
        $property
    }
}
if ($inventoryDifferences) {
    throw "The recorded source and restored inventories differ: $($inventoryDifferences -join ', ')"
}

Assert-NoReparsePoint -Path $manifest.passphrase_custody.recovery_key_path
$recoveryKeyPath = (Resolve-Path -LiteralPath $manifest.passphrase_custody.recovery_key_path).Path
$keyFileHashProperty = $manifest.passphrase_custody.PSObject.Properties['recovery_key_file_sha256']
$expectedKeyFileHash = if ($null -ne $keyFileHashProperty) {
    $keyFileHashProperty.Value
} else {
    $manifest.passphrase_custody.recovery_key_sha256
}
if ((Get-Sha256 -Path $recoveryKeyPath) -cne $expectedKeyFileHash) {
    throw 'DPAPI recovery-key file SHA-256 mismatch.'
}
$keyRecord = Get-Content -LiteralPath $recoveryKeyPath -Raw | ConvertFrom-Json
if ($keyRecord.project_ref -cne $manifest.source_project_ref -or
    $keyRecord.protection -cne 'Windows DPAPI CurrentUser') {
    throw 'The DPAPI recovery-key envelope does not match the backup manifest.'
}

[byte[]]$entropyBytes = $null
[byte[]]$protectedBytes = $null
[byte[]]$plainBytes = $null
$passphrasePlainText = $null
try {
    $entropyBytes = [Text.Encoding]::UTF8.GetBytes($keyRecord.entropy_context)
    switch ($keyRecord.format) {
        'mutqan-backup-recovery-key-v1' {
            $protectedBytes = [Convert]::FromBase64String($keyRecord.protected_passphrase_base64)
        }
        'mutqan-backup-recovery-key-v2' {
            $protectedBytes = [Convert]::FromBase64String($keyRecord.protected_random_bytes_base64)
        }
        default {
            throw "Unsupported DPAPI recovery-key format: $($keyRecord.format)"
        }
    }
    $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
        $protectedBytes,
        $entropyBytes,
        [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $passphrasePlainText = if ($keyRecord.format -ceq 'mutqan-backup-recovery-key-v1') {
        [Text.Encoding]::UTF8.GetString($plainBytes)
    } else {
        [Convert]::ToBase64String($plainBytes)
    }

    foreach ($artifact in @($manifest.artifacts | Where-Object {
        $null -ne $_.PSObject.Properties['encrypted_sha256']
    })) {
        $encryptedPath = Assert-ChildPath -Candidate (Join-Path $backupDirectory $artifact.path) -Parent $backupDirectory
        $checkPath = Assert-ChildPath -Candidate (
            Join-Path $backupDirectory ('.dpapi-check-' + [Guid]::NewGuid().ToString('N') + '.part')
        ) -Parent $backupDirectory
        try {
            $decryptArguments = @(
                'enc', '-d', '-aes-256-cbc', '-saltlen', '16', '-pbkdf2',
                '-iter', '600000', '-md', 'sha256', '-pass', 'stdin',
                '-in', $encryptedPath, '-out', $checkPath
            )
            Invoke-OpenSslWithPassphrase `
                -Executable $openSslPath `
                -Arguments $decryptArguments `
                -Passphrase $passphrasePlainText
            Assert-NoReparsePoint -Path $checkPath
            if ((Get-Sha256 -Path $checkPath) -cne $artifact.decrypted_sha256) {
                throw "Independent decrypted SHA-256 mismatch: $($artifact.path)"
            }
        } finally {
            if (Test-Path -LiteralPath $checkPath) {
                Remove-Item -LiteralPath $checkPath -Force
            }
        }
    }
} finally {
    foreach ($buffer in @($entropyBytes, $protectedBytes, $plainBytes)) {
        if ($null -ne $buffer) {
            [Array]::Clear($buffer, 0, $buffer.Length)
        }
    }
    $passphrasePlainText = $null
}

if (Test-Path -LiteralPath (Join-Path $backupDirectory 'restore-cluster')) {
    throw 'The isolated restore cluster was not removed after verification.'
}

$databaseArtifact = $manifest.artifacts | Where-Object path -Like '*.dump.enc'
$rolesArtifact = $manifest.artifacts | Where-Object path -Like '*.sql.enc'
[pscustomobject]@{
    gate_status = $manifest.gate_status
    source_project_ref = $manifest.source_project_ref
    backup_started_utc = ([DateTime]$manifest.backup_started_utc).ToUniversalTime().ToString(
        'o',
        [Globalization.CultureInfo]::InvariantCulture
    )
    backup_finished_utc = ([DateTime]$manifest.backup_finished_utc).ToUniversalTime().ToString(
        'o',
        [Globalization.CultureInfo]::InvariantCulture
    )
    database_bytes = [int64]$databaseArtifact.bytes
    database_encrypted_sha256 = $databaseArtifact.encrypted_sha256
    roles_bytes = [int64]$rolesArtifact.bytes
    roles_encrypted_sha256 = $rolesArtifact.encrypted_sha256
    manifest_sha256 = $actualManifestHash
    inventory_match = $true
    independent_dpapi_decrypt = $true
    restore_cluster_cleaned = $true
    storage_objects_included = $manifest.storage_objects_included
}
