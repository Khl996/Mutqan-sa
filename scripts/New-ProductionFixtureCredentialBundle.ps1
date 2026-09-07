<#
.SYNOPSIS
    Refreshes passwords for an exact allowlist of Mutqan test-only Auth users.

.DESCRIPTION
    The script is intentionally narrow. It validates the production project,
    fixture tenants, Auth identities, profile ids, roles, and active state before
    changing anything. Passwords are generated locally, are never printed, and
    are written only to a Windows DPAPI CurrentUser envelope outside the repo.

    Without -RotatePasswords this is a read-only validation command.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SourceEnvPath,

    [string]$ExpectedProjectRef = 'mzpohntjotgeeaukwnbz',

    [string]$OutputRoot = (Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Mutqan\CanaryCredentials'),

    [switch]$RotatePasswords
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$tenantA = '11111111-1111-4111-8111-111111111111'
$tenantB = '22222222-2222-4222-8222-222222222222'
$expectedTenants = @(
    [ordered]@{ id = $tenantA; name = 'Mutqan Fixture Tenant A'; slug = 'mutqan-fixture-tenant-a' },
    [ordered]@{ id = $tenantB; name = 'Mutqan Fixture Tenant B'; slug = 'mutqan-fixture-tenant-b' }
)
$expectedAccounts = @(
    [ordered]@{
        email = 'fixture.tenant.a.manager@mutqan.test'
        tenant_id = $tenantA
        role = 'maintenance_manager'
        is_active = $true
    },
    [ordered]@{
        email = 'fixture.tenant.a.technician@mutqan.test'
        tenant_id = $tenantA
        role = 'technician'
        is_active = $true
    },
    [ordered]@{
        email = 'fixture.tenant.a.reporter@mutqan.test'
        tenant_id = $tenantA
        role = 'reporter'
        is_active = $true
    },
    [ordered]@{
        email = 'fixture.tenant.b.user@mutqan.test'
        tenant_id = $tenantB
        role = 'tenant_admin'
        is_active = $true
    },
    [ordered]@{
        email = 'fixture.tenant.a.inactive.technician@mutqan.test'
        tenant_id = $tenantA
        role = 'technician'
        is_active = $false
    }
)

function Read-DotEnv {
    param([Parameter(Mandatory)] [string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Environment file not found: $Path"
    }

    $map = @{}
    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) {
            continue
        }
        $key, $value = $line.Split('=', 2)
        $map[$key.Trim()] = $value.Trim().Trim('"').Trim("'")
    }
    return $map
}

function Get-EnvValue {
    param(
        [Parameter(Mandatory)] [hashtable]$FileValues,
        [Parameter(Mandatory)] [string[]]$Names
    )

    foreach ($name in $Names) {
        $processValue = [Environment]::GetEnvironmentVariable($name, 'Process')
        if (-not [string]::IsNullOrWhiteSpace($processValue)) {
            return $processValue
        }
        if ($FileValues.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($FileValues[$name])) {
            return $FileValues[$name]
        }
    }
    throw "Missing required environment variable name: $($Names -join ' or ')"
}

function Invoke-SafeJsonRequest {
    param(
        [Parameter(Mandatory)] [string]$Operation,
        [Parameter(Mandatory)] [string]$Method,
        [Parameter(Mandatory)] [string]$Uri,
        [Parameter(Mandatory)] [hashtable]$Headers,
        [object]$Body
    )

    try {
        $arguments = @{
            Method = $Method
            Uri = $Uri
            Headers = $Headers
            TimeoutSec = 30
        }
        if ($PSBoundParameters.ContainsKey('Body')) {
            $arguments.ContentType = 'application/json'
            $arguments.Body = $Body | ConvertTo-Json -Depth 12 -Compress
        }
        return Invoke-RestMethod @arguments
    } catch {
        $statusCode = if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            [int]$_.Exception.Response.StatusCode
        } else {
            0
        }
        throw "$Operation failed (HTTP $statusCode). No credential material was logged."
    }
}

function Get-JwtPayload {
    param([Parameter(Mandatory)] [string]$Token)

    $parts = $Token.Split('.')
    if ($parts.Count -ne 3) {
        throw 'Auth returned a malformed access token.'
    }
    $encoded = $parts[1].Replace('-', '+').Replace('_', '/')
    while (($encoded.Length % 4) -ne 0) { $encoded += '=' }
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json
}

function New-RandomPassword {
    [byte[]]$randomBytes = $null
    try {
        $randomBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(24)
        $base = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        return "$base-Aa7!"
    } finally {
        if ($null -ne $randomBytes) {
            [Array]::Clear($randomBytes, 0, $randomBytes.Length)
        }
    }
}

function Write-ProtectedCredentialEnvelope {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$ProjectRef,
        [Parameter(Mandatory)] [object[]]$Accounts,
        [Parameter(Mandatory)] [string]$CreatedUtc,
        [Parameter(Mandatory)] [string]$WindowsIdentity
    )

    $entropyContext = "Mutqan:FixtureCredentials:$ProjectRef:v1"
    $partPath = "$Path.part"
    [byte[]]$plainBytes = $null
    [byte[]]$entropyBytes = $null
    [byte[]]$protectedBytes = $null
    [byte[]]$roundTripBytes = $null
    try {
        $payload = [ordered]@{
            format = 'mutqan-fixture-credentials-v1'
            project_ref = $ProjectRef
            created_utc = $CreatedUtc
            accounts = $Accounts
        }
        $plainBytes = [Text.UTF8Encoding]::new($false).GetBytes(
            ($payload | ConvertTo-Json -Depth 8 -Compress)
        )
        $entropyBytes = [Text.Encoding]::UTF8.GetBytes($entropyContext)
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
            $plainBytes,
            $entropyBytes,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $envelope = [ordered]@{
            format = 'mutqan-fixture-credential-envelope-v1'
            project_ref = $ProjectRef
            created_utc = $CreatedUtc
            protection = 'Windows DPAPI CurrentUser'
            entropy_context = $entropyContext
            protected_json_base64 = [Convert]::ToBase64String($protectedBytes)
        }
        [IO.File]::WriteAllText(
            $partPath,
            ($envelope | ConvertTo-Json -Depth 5) + [Environment]::NewLine,
            [Text.UTF8Encoding]::new($false)
        )
        $aclResult = & icacls.exe $partPath /inheritance:r /grant:r "${WindowsIdentity}:F" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to restrict the credential envelope ACL: $partPath"
        }

        $stored = Get-Content -LiteralPath $partPath -Raw | ConvertFrom-Json
        $roundTripBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            [Convert]::FromBase64String($stored.protected_json_base64),
            $entropyBytes,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        if (-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals($plainBytes, $roundTripBytes)) {
            throw 'DPAPI credential-envelope round-trip verification failed.'
        }

        [IO.File]::Move($partPath, $Path, $true)
    } finally {
        if (Test-Path -LiteralPath $partPath) {
            Remove-Item -LiteralPath $partPath -Force
        }
        foreach ($buffer in @($plainBytes, $entropyBytes, $protectedBytes, $roundTripBytes)) {
            if ($null -ne $buffer) {
                [Array]::Clear($buffer, 0, $buffer.Length)
            }
        }
    }
}

$envValues = Read-DotEnv -Path $SourceEnvPath
$supabaseUrl = (Get-EnvValue -FileValues $envValues -Names @('VITE_SUPABASE_URL', 'SUPABASE_URL')).TrimEnd('/')
$anonKey = Get-EnvValue -FileValues $envValues -Names @('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
$serviceRoleKey = Get-EnvValue -FileValues $envValues -Names @('SUPABASE_SERVICE_ROLE_KEY')

$expectedUrl = "https://$ExpectedProjectRef.supabase.co"
if ($supabaseUrl -cne $expectedUrl) {
    throw "STOP: expected $expectedUrl but the supplied environment targets another project."
}

function Get-GitRoot {
    param([Parameter(Mandatory)] [string]$Path)

    $root = & git -C $Path rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$root)) {
        return $null
    }
    return [IO.Path]::TrimEndingDirectorySeparator([IO.Path]::GetFullPath(([string]$root).Trim()))
}

function Test-PathWithin {
    param(
        [Parameter(Mandatory)] [string]$Candidate,
        [Parameter(Mandatory)] [string]$Root
    )

    return $Candidate.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -or
        $Candidate.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-CredentialOutputPath {
    param([Parameter(Mandatory)] [string]$Path)

    $absolutePath = [IO.Path]::GetFullPath($Path)
    $cursor = [IO.DirectoryInfo]::new($absolutePath)
    # Walk existing ancestors too: OutputRoot itself may not exist yet. Reject
    # junctions/symlinks instead of claiming that a lexical path proves placement.
    while ($null -ne $cursor) {
        if (Test-Path -LiteralPath $cursor.FullName) {
            $item = Get-Item -LiteralPath $cursor.FullName -Force -ErrorAction Stop
            if (-not $item.PSIsContainer -or
                ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw 'STOP: credential output must use ordinary directories without reparse points.'
            }
            if ((Test-Path -LiteralPath (Join-Path $cursor.FullName '.git')) -or
                ((Test-Path -LiteralPath (Join-Path $cursor.FullName 'HEAD') -PathType Leaf) -and
                 (Test-Path -LiteralPath (Join-Path $cursor.FullName 'objects') -PathType Container) -and
                 (Test-Path -LiteralPath (Join-Path $cursor.FullName 'refs') -PathType Container))) {
                throw 'STOP: credential output must be outside every Git repository/worktree.'
            }
        }
        $cursor = $cursor.Parent
    }
}

$OutputRoot = [IO.Path]::TrimEndingDirectorySeparator([IO.Path]::GetFullPath($OutputRoot))
Assert-CredentialOutputPath -Path $OutputRoot
$sourceRepoRoot = Get-GitRoot -Path (Split-Path -Parent (Resolve-Path -LiteralPath $SourceEnvPath).Path)
$scriptRepoRoot = Get-GitRoot -Path $PSScriptRoot
if ($null -eq $sourceRepoRoot -or $null -eq $scriptRepoRoot) {
    throw 'STOP: unable to prove the source repository boundaries for credential output.'
}
foreach ($repoRoot in @($sourceRepoRoot, $scriptRepoRoot) | Where-Object { $null -ne $_ }) {
    if (Test-PathWithin -Candidate $OutputRoot -Root $repoRoot) {
        throw 'STOP: credential output must be outside every source repository.'
    }
}

$serviceHeaders = @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
    Accept = 'application/json'
}
$anonHeaders = @{
    apikey = $anonKey
    Authorization = "Bearer $anonKey"
    Accept = 'application/json'
}

foreach ($expectedTenant in $expectedTenants) {
    $tenantRows = @(
        Invoke-SafeJsonRequest `
            -Operation "Read fixture tenant $($expectedTenant.id)" `
            -Method Get `
            -Uri "$supabaseUrl/rest/v1/tenants?id=eq.$($expectedTenant.id)&select=id,name,slug,is_active" `
            -Headers $serviceHeaders
    )
    if ($tenantRows.Count -ne 1 -or
        $tenantRows[0].name -cne $expectedTenant.name -or
        $tenantRows[0].slug -cne $expectedTenant.slug -or
        $tenantRows[0].is_active -ne $true) {
        throw "STOP: tenant $($expectedTenant.id) is not the exact active fixture tenant."
    }
}

$allAuthUsers = New-Object System.Collections.Generic.List[object]
for ($page = 1; $page -le 20; $page += 1) {
    $response = Invoke-SafeJsonRequest `
        -Operation "List Auth users page $page" `
        -Method Get `
        -Uri "$supabaseUrl/auth/v1/admin/users?page=$page&per_page=1000" `
        -Headers $serviceHeaders
    foreach ($user in @($response.users)) {
        $allAuthUsers.Add($user)
    }
    if (@($response.users).Count -lt 1000) { break }
}

$validatedAccounts = New-Object System.Collections.Generic.List[object]
foreach ($expected in $expectedAccounts) {
    $authMatches = @($allAuthUsers | Where-Object { $_.email -ceq $expected.email })
    $encodedEmail = [Uri]::EscapeDataString("eq.$($expected.email)")
    $profileRows = @(
        Invoke-SafeJsonRequest `
            -Operation "Read fixture profile $($expected.email)" `
            -Method Get `
            -Uri "$supabaseUrl/rest/v1/profiles?email=$encodedEmail&select=id,email,tenant_id,role,is_active,is_super_admin" `
            -Headers $serviceHeaders
    )

    if ($authMatches.Count -ne 1 -or $profileRows.Count -ne 1) {
        throw "STOP: $($expected.email) must have exactly one Auth user and one profile."
    }
    $authUser = $authMatches[0]
    $profile = $profileRows[0]
    if ($authUser.id -cne $profile.id -or
        $profile.tenant_id -cne $expected.tenant_id -or
        $profile.role -cne $expected.role -or
        [bool]$profile.is_active -ne [bool]$expected.is_active -or
        [bool]$profile.is_super_admin -or
        [string]::IsNullOrWhiteSpace([string]$authUser.email_confirmed_at)) {
        throw "STOP: Auth/profile authority mismatch for $($expected.email)."
    }

    $validatedAccounts.Add([ordered]@{
        email = $expected.email
        user_id = [string]$authUser.id
        tenant_id = $expected.tenant_id
        role = $expected.role
        is_active = [bool]$expected.is_active
    })
    Write-Host "[PASS] validated fixture identity: $($expected.email)"
}

if (-not $RotatePasswords) {
    Write-Host "FIXTURE AUTH VALIDATION: PASS (read-only; $($validatedAccounts.Count) exact identities)"
    return
}

$timestamp = [DateTimeOffset]::UtcNow.ToString(
    'yyyyMMddTHHmmssfffZ',
    [Globalization.CultureInfo]::InvariantCulture
)
$artifactDir = Join-Path $OutputRoot $timestamp
New-Item -ItemType Directory -Path $artifactDir | Out-Null
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$aclResult = & icacls.exe $artifactDir /inheritance:r /grant:r "${currentIdentity}:(OI)(CI)F" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Unable to restrict the credential artifact directory ACL: $artifactDir"
}

$bundlePath = Join-Path $artifactDir 'fixture-credentials.json.dpapi'
$recoveryBundlePath = Join-Path $artifactDir 'fixture-rotation-recovery.json.dpapi'
$journalPath = Join-Path $artifactDir 'fixture-rotation-journal.json'

function Write-RotationJournal {
    param([Parameter(Mandatory)] [string]$Path, [Parameter(Mandatory)] [object]$Journal)
    $part = "$Path.part"
    try {
        # The safe journal deliberately contains no passwords or Auth tokens.
        [IO.File]::WriteAllText($part, ($Journal | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
            [Text.UTF8Encoding]::new($false))
        [IO.File]::Move($part, $Path, $true)
    } finally {
        if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force }
    }
}

function Invoke-RecoverableFixtureRotation {
    param(
        [Parameter(Mandatory)] [object[]]$Accounts,
        [Parameter(Mandatory)] [string]$RecoveryPath,
        [Parameter(Mandatory)] [string]$JournalPath,
        [Parameter(Mandatory)] [string]$ProjectRef,
        [Parameter(Mandatory)] [string]$CreatedUtc,
        [Parameter(Mandatory)] [string]$WindowsIdentity,
        [Parameter(Mandatory)] [scriptblock]$RotateAndVerify
    )

    $planned = @($Accounts | ForEach-Object {
        [ordered]@{
            email = $_.email; password = New-RandomPassword; user_id = $_.user_id
            tenant_id = $_.tenant_id; role = $_.role; is_active = $_.is_active
        }
    })
    # Persist every planned password before the first remote change. This immutable
    # recovery envelope survives response loss, session failure, and final publish failure.
    Write-ProtectedCredentialEnvelope -Path $RecoveryPath -ProjectRef $ProjectRef -Accounts $planned `
        -CreatedUtc $CreatedUtc -WindowsIdentity $WindowsIdentity
    $journal = [ordered]@{
        format = 'mutqan-fixture-rotation-journal-v1'
        project_ref = $ProjectRef; created_utc = $CreatedUtc
        state = 'prepared'; recovery_file = [IO.Path]::GetFileName($RecoveryPath)
        recovery_sha256 = (Get-FileHash -LiteralPath $RecoveryPath -Algorithm SHA256).Hash.ToLowerInvariant()
        accounts = @($planned | ForEach-Object {
            [ordered]@{ user_id = $_.user_id; email = $_.email; state = 'not_attempted' }
        })
    }
    Write-RotationJournal -Path $JournalPath -Journal $journal
    for ($index = 0; $index -lt $planned.Count; $index++) {
        $journal.state = 'in_progress'
        $journal.accounts[$index].state = 'attempting_outcome_unknown'
        Write-RotationJournal -Path $JournalPath -Journal $journal
        try {
            & $RotateAndVerify $planned[$index] | Out-Null
            $journal.accounts[$index].state = 'verified'
            Write-RotationJournal -Path $JournalPath -Journal $journal
        } catch {
            # Leave the prewritten unknown/verified journal and immutable recovery
            # envelope intact. Do not mask uncertainty with a success manifest.
            throw "Fixture rotation stopped; inspect the safe journal and protected recovery envelope in $([IO.Path]::GetDirectoryName($RecoveryPath))."
        }
    }
    $journal.state = 'all_accounts_verified_pending_publication'
    Write-RotationJournal -Path $JournalPath -Journal $journal
    return $planned
}

$rotatedAccounts = @(Invoke-RecoverableFixtureRotation -Accounts $validatedAccounts.ToArray() `
    -RecoveryPath $recoveryBundlePath -JournalPath $journalPath -ProjectRef $ExpectedProjectRef `
    -CreatedUtc $timestamp -WindowsIdentity $currentIdentity -RotateAndVerify {
    param($validated)
    $password = $validated.password
    Invoke-SafeJsonRequest `
        -Operation "Rotate password for allowlisted fixture user $($validated.email)" `
        -Method Put `
        -Uri "$supabaseUrl/auth/v1/admin/users/$($validated.user_id)" `
        -Headers $serviceHeaders `
        -Body @{ password = $password } | Out-Null

    $session = Invoke-SafeJsonRequest `
        -Operation "Verify password session for allowlisted fixture user $($validated.email)" `
        -Method Post `
        -Uri "$supabaseUrl/auth/v1/token?grant_type=password" `
        -Headers $anonHeaders `
        -Body @{ email = $validated.email; password = $password }
    if ([string]::IsNullOrWhiteSpace([string]$session.access_token)) {
        throw "Password rotation verification returned no session for $($validated.email)."
    }
    $payload = Get-JwtPayload -Token $session.access_token
    if ([string]$payload.sub -cne [string]$validated.user_id -or
        [string]$payload.iss -cne "$expectedUrl/auth/v1" -or
        [int64]$payload.exp -le [DateTimeOffset]::UtcNow.AddMinutes(5).ToUnixTimeSeconds()) {
        throw "Password rotation verification returned the wrong session identity for $($validated.email)."
    }

    Write-Host "[PASS] rotated and verified fixture identity: $($validated.email)"
})
Write-ProtectedCredentialEnvelope -Path $bundlePath -ProjectRef $ExpectedProjectRef -Accounts $rotatedAccounts `
    -CreatedUtc $timestamp -WindowsIdentity $currentIdentity

$bundleHash = (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestPath = Join-Path $artifactDir 'fixture-credentials.manifest.json'
$manifest = [ordered]@{
    format = 'mutqan-fixture-credential-manifest-v1'
    project_ref = $ExpectedProjectRef
    created_utc = $timestamp
    protection = 'Windows DPAPI CurrentUser'
    account_count = $rotatedAccounts.Count
    accounts = @($rotatedAccounts | ForEach-Object {
        [ordered]@{
            email = $_.email
            user_id = $_.user_id
            tenant_id = $_.tenant_id
            role = $_.role
            is_active = $_.is_active
        }
    })
    protected_bundle_file = [IO.Path]::GetFileName($bundlePath)
    protected_bundle_bytes = (Get-Item -LiteralPath $bundlePath).Length
    protected_bundle_sha256 = $bundleHash
}
[IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
    [Text.UTF8Encoding]::new($false)
)
$journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
$journal.state = 'published'
Write-RotationJournal -Path $journalPath -Journal $journal

Write-Host "FIXTURE AUTH ROTATION: PASS ($($rotatedAccounts.Count) exact test-only identities)"
Write-Host "Protected credential bundle: $bundlePath"
Write-Host "Safe manifest: $manifestPath"
Write-Host "Protected bundle SHA-256: $bundleHash"
