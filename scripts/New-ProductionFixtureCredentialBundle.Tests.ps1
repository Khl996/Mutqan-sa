#requires -Version 7.2
# Offline tests use real DPAPI with disposable synthetic accounts. No network.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$source = Join-Path $PSScriptRoot 'New-ProductionFixtureCredentialBundle.ps1'
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Credential script does not parse.' }
foreach ($name in @('Assert-CredentialOutputPath', 'New-RandomPassword', 'Write-ProtectedCredentialEnvelope',
    'Write-RotationJournal', 'Invoke-RecoverableFixtureRotation')) {
    $node = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name }, $true)
    if ($null -eq $node) { throw "Missing test target $name" }
    . ([scriptblock]::Create($node.Extent.Text))
}
$testCount = 0
function Assert-Test {
    param([bool]$Condition, [string]$Name)
    if (-not $Condition) { throw "FAIL $Name" }
    $script:testCount++
    Write-Output "PASS $Name"
}
function Assert-Throws {
    param([scriptblock]$Action, [string]$Expected, [string]$Name)
    $message = $null
    try { & $Action | Out-Null } catch { $message = $_.Exception.Message }
    Assert-Test ($null -ne $message -and $message -like $Expected) $Name
}
function Read-SyntheticRecovery {
    param([string]$Path)
    $envelope = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    [byte[]]$entropy = [Text.Encoding]::UTF8.GetBytes($envelope.entropy_context)
    [byte[]]$cipher = [Convert]::FromBase64String($envelope.protected_json_base64)
    [byte[]]$plain = $null
    try {
        $plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        return [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
    } finally {
        foreach ($buffer in @($entropy, $cipher, $plain)) { if ($null -ne $buffer) { [Array]::Clear($buffer, 0, $buffer.Length) } }
    }
}
$testParent = [Environment]::GetFolderPath('CommonApplicationData')
$testRoot = Join-Path $testParent ('mutqan-fixture-hardening-' + [Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $testRoot)
$windowsIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
try {
    Assert-CredentialOutputPath -Path (Join-Path $testRoot 'missing\nested\output')
    Assert-Test $true 'ordinary nonexistent output is accepted'
    $repo = Join-Path $testRoot 'third-repo'
    [void](New-Item -ItemType Directory -Path $repo)
    & git -C $repo init --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Could not initialize disposable Git repository.' }
    Assert-Throws { Assert-CredentialOutputPath -Path (Join-Path $repo 'missing\output') } '*outside every Git*' 'third repository descendant rejected'
    Assert-Throws { Assert-CredentialOutputPath -Path $repo } '*outside every Git*' 'repository root rejected'
    $worktree = Join-Path $testRoot 'worktree'
    [void](New-Item -ItemType Directory -Path $worktree)
    [IO.File]::WriteAllText((Join-Path $worktree '.git'), 'gitdir: synthetic')
    Assert-Throws { Assert-CredentialOutputPath -Path (Join-Path $worktree 'output') } '*outside every Git*' 'worktree .git file rejected'
    $bare = Join-Path $testRoot 'bare'
    [void](New-Item -ItemType Directory -Path $bare)
    & git -C $bare init --bare --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Could not initialize disposable bare repository.' }
    Assert-Throws { Assert-CredentialOutputPath -Path (Join-Path $bare 'output') } '*outside every Git*' 'bare repository rejected'
    $link = Join-Path $testRoot 'junction'
    [void](New-Item -ItemType Junction -Path $link -Target $repo)
    try { Assert-Throws { Assert-CredentialOutputPath -Path (Join-Path $link 'output') } '*without reparse points*' 'junction rejected' }
    finally { [IO.Directory]::Delete($link) }

    $accounts = @(
        [pscustomobject]@{ email = 'synthetic-a@example.invalid'; user_id = 'user-a'; tenant_id = 'tenant-a'; role = 'technician'; is_active = $true },
        [pscustomobject]@{ email = 'synthetic-b@example.invalid'; user_id = 'user-b'; tenant_id = 'tenant-a'; role = 'maintenance_manager'; is_active = $true }
    )
    $run = Join-Path $testRoot 'rotation'
    [void](New-Item -ItemType Directory -Path $run)
    $recovery = Join-Path $run 'recovery.dpapi'
    $journal = Join-Path $run 'journal.json'
    $script:testJournalPath = $journal
    $script:remoteCalls = 0
    $script:recoveryHash = $null
    $script:callbackStep = 'before callback'
    try { $result = @(Invoke-RecoverableFixtureRotation -Accounts $accounts -RecoveryPath $recovery -JournalPath $journal `
        -ProjectRef 'synthetic-project' -CreatedUtc '20260907T000000000Z' -WindowsIdentity $windowsIdentity -RotateAndVerify {
        param($account)
        $script:callbackStep = 'decrypt recovery'
        $saved = Read-SyntheticRecovery $recovery
        $script:callbackStep = 'compare saved account'
        if (@($saved.accounts).Count -ne 2) { throw 'All passwords must be durable before the first request.' }
        $matching = @($saved.accounts | Where-Object { $_.user_id -ceq $account.user_id })
        if ($matching.Count -ne 1 -or $matching[0].password -cne $account.password) { throw 'Recovery password mismatch.' }
        $script:callbackStep = 'read journal'
        $state = Get-Content -LiteralPath $script:testJournalPath -Raw | ConvertFrom-Json
        $script:callbackStep = 'check pre-request journal state'
        if ($state.accounts[$script:remoteCalls].state -cne 'attempting_outcome_unknown') { throw 'Unknown outcome must be journaled before request.' }
        $hash = (Get-FileHash -LiteralPath $recovery).Hash
        if ($script:remoteCalls -gt 0 -and $hash -cne $script:recoveryHash) { throw 'Recovery envelope was rewritten.' }
        $script:recoveryHash = $hash
        $script:remoteCalls++
    }) } catch { throw "Synthetic rotation test failed at: $script:callbackStep" }
    Assert-Test ($script:remoteCalls -eq 2 -and $result.Count -eq 2) 'all accounts durable before requests and returned as flat array'
    $state = Get-Content -LiteralPath $journal -Raw | ConvertFrom-Json
    Assert-Test ($state.state -ceq 'all_accounts_verified_pending_publication') 'success is not published prematurely'
    Assert-Test (@($state.accounts | Where-Object { $_.state -cne 'verified' }).Count -eq 0) 'each account journaled verified'
    $rawArtifacts = (Get-Content -LiteralPath $journal -Raw) + (Get-Content -LiteralPath $recovery -Raw)
    foreach ($account in $result) { Assert-Test (-not $rawArtifacts.Contains($account.password)) 'no generated plaintext password in artifacts' }

    $failedRun = Join-Path $testRoot 'lost-response'
    [void](New-Item -ItemType Directory -Path $failedRun)
    $recovery = Join-Path $failedRun 'recovery.dpapi'; $journal = Join-Path $failedRun 'journal.json'
    $script:remoteCalls = 0
    Assert-Throws {
        Invoke-RecoverableFixtureRotation -Accounts $accounts -RecoveryPath $recovery -JournalPath $journal `
            -ProjectRef 'synthetic-project' -CreatedUtc '20260907T000000000Z' -WindowsIdentity $windowsIdentity -RotateAndVerify {
            param($account)
            $script:remoteCalls++
            if ($script:remoteCalls -eq 2) { throw 'SIMULATED_RESPONSE_LOSS' }
        }
    } 'Fixture rotation stopped;*' 'lost remote response stops publication'
    $saved = Read-SyntheticRecovery $recovery
    $state = Get-Content -LiteralPath $journal -Raw | ConvertFrom-Json
    Assert-Test (@($saved.accounts).Count -eq 2) 'all passwords recoverable after interrupted second account'
    Assert-Test ($state.accounts[0].state -ceq 'verified' -and $state.accounts[1].state -ceq 'attempting_outcome_unknown') 'partial journal preserves known and uncertain outcomes'
    Assert-Test (-not (Test-Path -LiteralPath (Join-Path $failedRun 'fixture-credentials.manifest.json'))) 'interrupted rotation has no success manifest'

    $script:remoteCalls = 0
    Assert-Throws {
        Invoke-RecoverableFixtureRotation -Accounts $accounts -RecoveryPath (Join-Path $testRoot 'not-created\recovery.dpapi') `
            -JournalPath (Join-Path $testRoot 'not-created\journal.json') -ProjectRef 'synthetic-project' `
            -CreatedUtc '20260907T000000000Z' -WindowsIdentity $windowsIdentity -RotateAndVerify { $script:remoteCalls++ }
    } '*' 'recovery storage failure stops before requests'
    Assert-Test ($script:remoteCalls -eq 0) 'zero remote calls if recovery cannot be persisted'
} finally {
    # The exact random directory was created here; verify its resolved parent
    # before recursively removing synthetic fixtures only. Junction was removed above.
    $resolvedRoot = (Resolve-Path -LiteralPath $testRoot).Path
    if ([IO.Path]::GetDirectoryName($resolvedRoot).TrimEnd('\') -ine $testParent.TrimEnd('\') -or
        [IO.Path]::GetFileName($resolvedRoot) -notmatch '^mutqan-fixture-hardening-[a-f0-9]{32}$') {
        throw 'Refusing test cleanup outside the exact generated temporary directory.'
    }
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
}
Write-Output "PASS: $testCount offline cases; no production or network requests made."
