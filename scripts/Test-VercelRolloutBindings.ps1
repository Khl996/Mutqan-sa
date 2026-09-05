#requires -Version 7.2
<#
.SYNOPSIS
Read-only, fail-closed check of the active Mutqan Vercel rollout bindings.
.DESCRIPTION
Uses the signed-in Vercel CLI without reading credential files. Only GET requests
are permitted. Raw API responses and failures are never printed or written.
Run immediately before/after each rollout action; this is not an atomic platform
lock and does not prove that application/database acceptance has passed.

Offline mode accepts a JSON object with deployment, project, and aliases (array)
fields matching the corresponding GET response shapes. It performs no network IO.
Only an actual gitSource.sha/meta.*CommitSha field proves source identity;
operator-supplied metadata such as reviewedGitSha is deliberately insufficient.

API references verified 2026-09-05:
https://vercel.com/docs/rest-api/aliases/get-an-alias
https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url
.EXAMPLE
./scripts/Test-VercelRolloutBindings.ps1 -NodePath <node24.exe> -VercelCliPath <vc.js> -ExpectedDeploymentId <dpl_id> -ExpectedGitSha <40-character-sha>
.EXAMPLE
./scripts/Test-VercelRolloutBindings.ps1 -FixtureJson $syntheticJson -ExpectedDeploymentId <dpl_id> -ExpectedGitSha <40-character-sha>
#>
[CmdletBinding(DefaultParameterSetName = 'Live')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Live')]
    [string]$NodePath,
    [Parameter(Mandatory, ParameterSetName = 'Live')]
    [string]$VercelCliPath,
    [Parameter(Mandatory, ParameterSetName = 'Offline')]
    [string]$FixtureJson,
    [Parameter(Mandatory)]
    [ValidatePattern('^dpl_[A-Za-z0-9]+$')]
    [string]$ExpectedDeploymentId,
    [Parameter(Mandatory)]
    [ValidatePattern('^[a-fA-F0-9]{40}$')]
    [string]$ExpectedGitSha,
    [ValidatePattern('^prj_[A-Za-z0-9]+$')]
    [string]$ProjectId = 'prj_HdC7xYBXV3V2CE5ysTZYUnx5nUbb',
    [ValidatePattern('^[a-zA-Z0-9-]+$')]
    [string]$Scope = 'khalids-projects-ce6e36f2',
    [ValidateSet('Enabled', 'Disabled')]
    [string]$ExpectedCronState = 'Enabled'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$requiredAliases = @(
    'mutqan-sa.com',
    'mutqan-sa-fhc7-khalids-projects-ce6e36f2.vercel.app',
    'mutqan-sa-fhc7-git-main-khalids-projects-ce6e36f2.vercel.app'
)
$requiredSchedules = @{
    '/api/check-subscriptions' = '0 3 * * *'
    '/api/pm-generate-wos' = '0 6 * * *'
}

function Get-Field {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [Collections.IDictionary]) { return $Object[$Name] }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Assert-Binding {
    param([bool]$Condition, [string]$Code)
    if (-not $Condition) { throw "VERCEL_BINDING_GUARD: $Code" }
}

function Invoke-CapturedNode {
    param([string[]]$Arguments)
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $script:resolvedNode
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Environment['PATH'] = (Split-Path -Parent $script:resolvedNode) + [IO.Path]::PathSeparator + $env:PATH
    $startInfo.Environment['CI'] = '1'
    $startInfo.Environment['NO_COLOR'] = '1'
    $startInfo.Environment['VERCEL_TELEMETRY_DISABLED'] = '1'
    foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        [void]$process.Start()
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(45000)) {
            $process.Kill($true)
            throw 'timeout'
        }
        $capturedOutput = $outputTask.GetAwaiter().GetResult()
        [void]$errorTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw 'nonzero' }
        return $capturedOutput
    } catch {
        # No raw output, API error message, command string, or exception details.
        throw 'VERCEL_BINDING_GUARD: CLI_READ_FAILED'
    } finally {
        $process.Dispose()
    }
}

function Get-VercelJson {
    param([string]$Endpoint)
    $captured = Invoke-CapturedNode -Arguments @(
        $script:resolvedCli, 'api', $Endpoint, '-X', 'GET', '--raw',
        '--scope', $Scope, '--no-color', '--non-interactive'
    )
    try { return ($captured | ConvertFrom-Json -Depth 100) }
    catch { throw 'VERCEL_BINDING_GUARD: INVALID_API_JSON' }
}

function Assert-RealGitSha {
    param($Deployment, [string]$CodePrefix)
    $gitSource = Get-Field $Deployment 'gitSource'
    $metadata = Get-Field $Deployment 'meta'
    $realShas = @(
        Get-Field $gitSource 'sha'
        Get-Field $metadata 'githubCommitSha'
        Get-Field $metadata 'gitCommitSha'
        Get-Field $metadata 'gitlabCommitSha'
        Get-Field $metadata 'bitbucketCommitSha'
    ) | Where-Object { $null -ne $_ -and $_ -cne '' }
    Assert-Binding (@($realShas).Count -gt 0) "$CodePrefix`_REAL_GIT_SHA_MISSING"
    foreach ($sha in $realShas) {
        Assert-Binding ($sha -is [string] -and $sha -match '^[a-fA-F0-9]{40}$' -and $sha -ieq $ExpectedGitSha) "$CodePrefix`_GIT_SHA_MISMATCH"
    }
}

if ($PSCmdlet.ParameterSetName -eq 'Offline') {
    try { $fixture = $FixtureJson | ConvertFrom-Json -Depth 100 }
    catch { throw 'VERCEL_BINDING_GUARD: INVALID_FIXTURE_JSON' }
    $deployment = Get-Field $fixture 'deployment'
    $project = Get-Field $fixture 'project'
    $aliases = @(Get-Field $fixture 'aliases')
} else {
    try {
        $script:resolvedNode = (Resolve-Path -LiteralPath $NodePath).Path
        $script:resolvedCli = (Resolve-Path -LiteralPath $VercelCliPath).Path
    } catch { throw 'VERCEL_BINDING_GUARD: TOOL_PATH_UNAVAILABLE' }
    $nodeVersion = (Invoke-CapturedNode -Arguments @('--version')).Trim()
    Assert-Binding ($nodeVersion -match '^v24\.[0-9]+\.[0-9]+$') 'NODE_24_REQUIRED'
    $deployment = Get-VercelJson "/v13/deployments/$ExpectedDeploymentId`?withGitRepoInfo=true"
    $project = Get-VercelJson "/v9/projects/$ProjectId"
    $aliases = @(foreach ($aliasName in $requiredAliases) {
        Get-VercelJson "/v4/aliases/$aliasName`?projectId=$ProjectId"
    })
}

Assert-Binding ((Get-Field $deployment 'id') -ceq $ExpectedDeploymentId) 'DEPLOYMENT_ID_MISMATCH'
Assert-Binding ((Get-Field $deployment 'projectId') -ceq $ProjectId) 'DEPLOYMENT_PROJECT_MISMATCH'
Assert-Binding ((Get-Field $deployment 'readyState') -ceq 'READY') 'DEPLOYMENT_NOT_READY'
Assert-Binding ((Get-Field $deployment 'target') -ceq 'production') 'DEPLOYMENT_NOT_PRODUCTION'
Assert-RealGitSha $deployment 'DEPLOYMENT'
$deploymentHost = Get-Field $deployment 'url'
Assert-Binding ($deploymentHost -is [string] -and $deploymentHost -match '^[a-z0-9-]+\.vercel\.app$') 'DEPLOYMENT_HOST_INVALID'
Assert-Binding ((Get-Field $project 'id') -ceq $ProjectId) 'PROJECT_ID_MISMATCH'
$productionTarget = Get-Field (Get-Field $project 'targets') 'production'
Assert-Binding ((Get-Field $productionTarget 'id') -ceq $ExpectedDeploymentId) 'PRODUCTION_TARGET_MISMATCH'
Assert-RealGitSha $productionTarget 'PRODUCTION_TARGET'

foreach ($aliasName in $requiredAliases) {
    $matches = @($aliases | Where-Object { (Get-Field $_ 'alias') -ceq $aliasName })
    Assert-Binding ($matches.Count -eq 1) 'ALIAS_MISSING_OR_DUPLICATE'
    $aliasRecord = $matches[0]
    Assert-Binding ((Get-Field $aliasRecord 'deploymentId') -ceq $ExpectedDeploymentId) 'ALIAS_DEPLOYMENT_MISMATCH'
    Assert-Binding ((Get-Field $aliasRecord 'projectId') -ceq $ProjectId) 'ALIAS_PROJECT_MISMATCH'
    Assert-Binding ([string]::IsNullOrEmpty((Get-Field $aliasRecord 'redirect'))) 'ALIAS_UNEXPECTED_REDIRECT'
    Assert-Binding ($null -eq (Get-Field $aliasRecord 'deletedAt')) 'ALIAS_DELETED'
    $nestedDeployment = Get-Field $aliasRecord 'deployment'
    if ($null -ne $nestedDeployment) {
        Assert-Binding ((Get-Field $nestedDeployment 'id') -ceq $ExpectedDeploymentId) 'ALIAS_NESTED_DEPLOYMENT_MISMATCH'
    }
}

$crons = Get-Field $project 'crons'
Assert-Binding ((Get-Field $crons 'deploymentId') -ceq $ExpectedDeploymentId) 'CRON_DEPLOYMENT_MISMATCH'
$enabledAt = Get-Field $crons 'enabledAt'
$disabledAt = Get-Field $crons 'disabledAt'
if ($ExpectedCronState -ceq 'Enabled') {
    Assert-Binding ($enabledAt -is [ValueType] -and $enabledAt -isnot [bool] -and $enabledAt -gt 0 -and $null -eq $disabledAt) 'CRON_NOT_ENABLED'
} else {
    Assert-Binding ($disabledAt -is [ValueType] -and $disabledAt -isnot [bool] -and $disabledAt -gt 0) 'CRON_NOT_DISABLED'
}
$definitions = @(Get-Field $crons 'definitions')
Assert-Binding ($definitions.Count -eq $requiredSchedules.Count) 'CRON_DEFINITION_COUNT_MISMATCH'
foreach ($cronPath in $requiredSchedules.Keys) {
    $matches = @($definitions | Where-Object { (Get-Field $_ 'path') -ceq $cronPath })
    Assert-Binding ($matches.Count -eq 1) 'CRON_PATH_MISSING_OR_DUPLICATE'
    Assert-Binding ((Get-Field $matches[0] 'schedule') -ceq $requiredSchedules[$cronPath]) 'CRON_SCHEDULE_MISMATCH'
    Assert-Binding ((Get-Field $matches[0] 'host') -ceq $deploymentHost) 'CRON_HOST_MISMATCH'
}

# Deliberate allowlist: no raw deployment/project/alias object leaves this script.
[pscustomobject]@{
    status = 'PASS'
    mode = $PSCmdlet.ParameterSetName
    observedAtUtc = [DateTimeOffset]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
    projectId = $ProjectId
    deploymentId = $ExpectedDeploymentId
    gitSha = $ExpectedGitSha.ToLowerInvariant()
    deploymentHost = $deploymentHost
    aliasesVerified = $requiredAliases
    cronState = $ExpectedCronState
    cronDefinitionsVerified = $requiredSchedules.Count
}
