#requires -Version 7.2
# Dependency-free offline tests. No credential, filesystem fixture, or network IO.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$guardPath = Join-Path $PSScriptRoot 'Test-VercelRolloutBindings.ps1'
$expectedId = 'dpl_SyntheticAccepted'
$expectedSha = '1111111111111111111111111111111111111111'
$projectId = 'prj_HdC7xYBXV3V2CE5ysTZYUnx5nUbb'
$aliasNames = @('mutqan-sa.com', 'mutqan-sa-fhc7-khalids-projects-ce6e36f2.vercel.app', 'mutqan-sa-fhc7-git-main-khalids-projects-ce6e36f2.vercel.app')

function New-Fixture {
    @{
        deployment = @{
            id = $expectedId; projectId = $projectId; readyState = 'READY'; target = 'production'
            url = 'synthetic-accepted.vercel.app'
            meta = @{ githubCommitSha = $expectedSha; reviewedGitSha = $expectedSha }
            env = @{ DO_NOT_PRINT = 'SYNTHETIC_SECRET_SENTINEL' }
        }
        project = @{
            id = $projectId
            targets = @{ production = @{ id = $expectedId; meta = @{ githubCommitSha = $expectedSha } } }
            crons = @{
                deploymentId = $expectedId; enabledAt = 1788602016378L; disabledAt = $null
                definitions = @(
                    @{ host = 'synthetic-accepted.vercel.app'; path = '/api/check-subscriptions'; schedule = '0 3 * * *' },
                    @{ host = 'synthetic-accepted.vercel.app'; path = '/api/pm-generate-wos'; schedule = '0 6 * * *' }
                )
            }
        }
        aliases = @($aliasNames | ForEach-Object { @{ alias = $_; deploymentId = $expectedId; projectId = $projectId; deployment = @{ id = $expectedId }; protectionBypass = 'SYNTHETIC_SECRET_SENTINEL' } })
    }
}

$testCount = 0
function Invoke-Case {
    param([string]$Name, [scriptblock]$Mutate = {}, [string]$ExpectedFailure = '', [string]$CronState = 'Enabled')
    $fixture = New-Fixture
    & $Mutate $fixture
    $failure = $null
    $result = $null
    try {
        $result = & $guardPath -FixtureJson ($fixture | ConvertTo-Json -Depth 20 -Compress) -ExpectedDeploymentId $expectedId -ExpectedGitSha $expectedSha -ExpectedCronState $CronState
    } catch { $failure = $_.Exception.Message }
    if ($ExpectedFailure) {
        if ($failure -cne "VERCEL_BINDING_GUARD: $ExpectedFailure") { throw "FAIL $Name (unexpected outcome)" }
    } else {
        if ($failure -or $null -eq $result -or $result.status -cne 'PASS') { throw "FAIL $Name (expected PASS)" }
        if (($result | ConvertTo-Json -Depth 10 -Compress) -match 'SYNTHETIC_SECRET_SENTINEL|protectionBypass|DO_NOT_PRINT') { throw "FAIL $Name (secret output)" }
    }
    $script:testCount++
    Write-Output "PASS $Name"
}

Invoke-Case 'consistent bindings'
Invoke-Case 'explicitly disabled checkpoint' { param($f) $f.project.crons.disabledAt = 1788602020000L } -CronState Disabled
Invoke-Case 'alternate real git field' { param($f) $f.deployment.meta.Remove('githubCommitSha'); $f.deployment.gitSource = @{ sha = $expectedSha } }
Invoke-Case 'wrong deployment' { param($f) $f.deployment.id = 'dpl_Other' } 'DEPLOYMENT_ID_MISMATCH'
Invoke-Case 'not READY' { param($f) $f.deployment.readyState = 'BUILDING' } 'DEPLOYMENT_NOT_READY'
Invoke-Case 'preview is not production' { param($f) $f.deployment.target = $null } 'DEPLOYMENT_NOT_PRODUCTION'
Invoke-Case 'wrong deployment project' { param($f) $f.deployment.projectId = 'prj_Other' } 'DEPLOYMENT_PROJECT_MISMATCH'
Invoke-Case 'reviewed metadata alone is insufficient' { param($f) $f.deployment.meta.Remove('githubCommitSha') } 'DEPLOYMENT_REAL_GIT_SHA_MISSING'
Invoke-Case 'conflicting real git fields' { param($f) $f.deployment.meta.gitCommitSha = '2222222222222222222222222222222222222222' } 'DEPLOYMENT_GIT_SHA_MISMATCH'
Invoke-Case 'wrong project response' { param($f) $f.project.id = 'prj_Other' } 'PROJECT_ID_MISMATCH'
Invoke-Case 'production pointer changed' { param($f) $f.project.targets.production.id = 'dpl_Other' } 'PRODUCTION_TARGET_MISMATCH'
Invoke-Case 'production pointer sha changed' { param($f) $f.project.targets.production.meta.githubCommitSha = '2222222222222222222222222222222222222222' } 'PRODUCTION_TARGET_GIT_SHA_MISMATCH'
Invoke-Case 'missing alias' { param($f) $f.aliases = @($f.aliases[0], $f.aliases[1]) } 'ALIAS_MISSING_OR_DUPLICATE'
Invoke-Case 'duplicate alias' { param($f) $f.aliases += $f.aliases[0] } 'ALIAS_MISSING_OR_DUPLICATE'
Invoke-Case 'alias drift' { param($f) $f.aliases[1].deploymentId = 'dpl_Other' } 'ALIAS_DEPLOYMENT_MISMATCH'
Invoke-Case 'alias wrong project' { param($f) $f.aliases[2].projectId = 'prj_Other' } 'ALIAS_PROJECT_MISMATCH'
Invoke-Case 'nested alias conflict' { param($f) $f.aliases[0].deployment.id = 'dpl_Other' } 'ALIAS_NESTED_DEPLOYMENT_MISMATCH'
Invoke-Case 'redirect alias' { param($f) $f.aliases[0].redirect = 'other.example' } 'ALIAS_UNEXPECTED_REDIRECT'
Invoke-Case 'deleted alias' { param($f) $f.aliases[0].deletedAt = 1788602016378L } 'ALIAS_DELETED'
Invoke-Case 'cron drift from skip-domain' { param($f) $f.project.crons.deploymentId = 'dpl_StagedCandidate' } 'CRON_DEPLOYMENT_MISMATCH'
Invoke-Case 'cron disabled unexpectedly' { param($f) $f.project.crons.disabledAt = 1788602020000L } 'CRON_NOT_ENABLED'
Invoke-Case 'cron enable metadata missing' { param($f) $f.project.crons.Remove('enabledAt') } 'CRON_NOT_ENABLED'
Invoke-Case 'cron enabled when freeze expected' {} 'CRON_NOT_DISABLED' -CronState Disabled
Invoke-Case 'missing cron' { param($f) $f.project.crons.definitions = @($f.project.crons.definitions[0]) } 'CRON_DEFINITION_COUNT_MISMATCH'
Invoke-Case 'duplicate cron' { param($f) $f.project.crons.definitions[1] = $f.project.crons.definitions[0] } 'CRON_PATH_MISSING_OR_DUPLICATE'
Invoke-Case 'cron schedule changed' { param($f) $f.project.crons.definitions[0].schedule = '* * * * *' } 'CRON_SCHEDULE_MISMATCH'
Invoke-Case 'cron host drift' { param($f) $f.project.crons.definitions[1].host = 'synthetic-staged.vercel.app' } 'CRON_HOST_MISMATCH'
Write-Output "PASS: $testCount offline cases; no Vercel requests made."
