#requires -Version 7.2
<#
.SYNOPSIS
    Dependency-free offline regression tests for hosted bridge acceptance guards.
.DESCRIPTION
    Parses the acceptance script without executing it. Only the exact definitions
    of Assert-Denied and Assert-PreparedCase are loaded. Pinned string constants
    are read with AST SafeGetValue; credentials and case records are synthetic.
    No environment files, credential bundles, deployments, or network are used.
#>

$ErrorActionPreference = 'Stop'
$acceptancePath = Join-Path $PSScriptRoot 'Invoke-HostedGovernanceBridgeAcceptance.ps1'
$parseTokens = $null
$parseErrors = $null
$acceptanceAst = [Management.Automation.Language.Parser]::ParseFile(
    $acceptancePath, [ref]$parseTokens, [ref]$parseErrors
)
if ($parseErrors.Count -ne 0) {
    throw 'FAIL: acceptance script has parser errors.'
}

function Get-AcceptanceStringConstant {
    param([Parameter(Mandatory)] [string]$Name)

    $assignments = @($acceptanceAst.EndBlock.Statements | Where-Object {
        $_ -is [Management.Automation.Language.AssignmentStatementAst] -and
        $_.Left -is [Management.Automation.Language.VariableExpressionAst] -and
        $_.Left.VariablePath.UserPath -ceq $Name
    })
    if ($assignments.Count -ne 1 -or
        $assignments[0].Right -isnot [Management.Automation.Language.CommandExpressionAst] -or
        $assignments[0].Right.Expression -isnot [Management.Automation.Language.StringConstantExpressionAst]) {
        throw "FAIL: expected exactly one literal assignment for $Name."
    }
    return $assignments[0].Right.Expression.SafeGetValue()
}

# Use the actual frozen constants without evaluating any assignment statement.
foreach ($constantName in @('tenantA', 'DeploymentId', 'DeploymentUrl', 'bridgeGitSha')) {
    Set-Variable -Name $constantName -Value (Get-AcceptanceStringConstant -Name $constantName)
}
$projectParameters = @($acceptanceAst.ParamBlock.Parameters | Where-Object {
    $_.Name.VariablePath.UserPath -ceq 'ExpectedProjectRef'
})
if ($projectParameters.Count -ne 1 -or
    $projectParameters[0].DefaultValue -isnot [Management.Automation.Language.StringConstantExpressionAst]) {
    throw 'FAIL: expected a literal ExpectedProjectRef parameter default.'
}
$ExpectedProjectRef = $projectParameters[0].DefaultValue.SafeGetValue()

foreach ($functionName in @('Assert-Denied', 'Assert-PreparedCase')) {
    $definitions = @($acceptanceAst.EndBlock.Statements | Where-Object {
        $_ -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $_.Name -ceq $functionName
    })
    if ($definitions.Count -ne 1) {
        throw "FAIL: expected exactly one top-level $functionName definition."
    }
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}

# Fail closed if a future guard unexpectedly starts making requests.
$networkAttempts = 0
function Invoke-RestMethod { $script:networkAttempts++; throw 'OFFLINE_TEST_NETWORK_FORBIDDEN' }
function Invoke-WebRequest { $script:networkAttempts++; throw 'OFFLINE_TEST_NETWORK_FORBIDDEN' }
function Invoke-Rpc { $script:networkAttempts++; throw 'OFFLINE_TEST_NETWORK_FORBIDDEN' }

$testCount = 0
function Invoke-DenialTest {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [int]$StatusCode,
        [AllowNull()] [object]$ErrorCode = '42501',
        [Parameter(Mandatory)] [int]$ExpectedStatusCode,
        [bool]$Ok = $false,
        [switch]$ShouldPass
    )

    $failure = $null
    try {
        Assert-Denied -Name $Name -ExpectedStatusCode $ExpectedStatusCode -Result @{
            Ok = $Ok; StatusCode = $StatusCode; ErrorCode = $ErrorCode; Body = $null
        } 6>$null
    } catch {
        $failure = $_.Exception.Message
    }
    if ($ShouldPass) {
        if ($null -ne $failure) { throw "FAIL $Name (expected accepted denial): $failure" }
    } else {
        $expectedFailure = "$Name did not produce the expected authorization denial (HTTP $StatusCode, code=$ErrorCode)."
        if ($failure -cne $expectedFailure) { throw "FAIL $Name (expected precise denial rejection): $failure" }
    }
    $script:testCount++
    Write-Output "PASS $Name"
}

Invoke-DenialTest 'anonymous 401/42501 accepted' -StatusCode 401 -ExpectedStatusCode 401 -ShouldPass
Invoke-DenialTest 'authenticated 403/42501 accepted' -StatusCode 403 -ExpectedStatusCode 403 -ShouldPass
Invoke-DenialTest 'anonymous 403 cannot substitute for 401' -StatusCode 403 -ExpectedStatusCode 401
Invoke-DenialTest 'authenticated 401 cannot substitute for 403' -StatusCode 401 -ExpectedStatusCode 403
foreach ($expectedStatus in @(401, 403)) {
    foreach ($status in @(0, 200, 400, 404, 429, 500, 503)) {
        # Even a matching SQLSTATE cannot turn transport/server errors into proof.
        Invoke-DenialTest "HTTP $status rejected for expected $expectedStatus" -StatusCode $status -ExpectedStatusCode $expectedStatus
    }
    Invoke-DenialTest "missing RPC 404/PGRST202 rejected for expected $expectedStatus" -StatusCode 404 -ErrorCode 'PGRST202' -ExpectedStatusCode $expectedStatus
    Invoke-DenialTest "successful 200 rejected for expected $expectedStatus" -StatusCode 200 -Ok $true -ExpectedStatusCode $expectedStatus
    Invoke-DenialTest "Ok=true rejected for expected $expectedStatus" -StatusCode $expectedStatus -Ok $true -ExpectedStatusCode $expectedStatus
    foreach ($wrongCode in @('42502', 'PGRST202', '22P02', '', $null)) {
        $codeLabel = if ($null -eq $wrongCode) { 'null' } elseif ($wrongCode -ceq '') { 'empty' } else { $wrongCode }
        Invoke-DenialTest "SQLSTATE $codeLabel rejected for HTTP $expectedStatus" -StatusCode $expectedStatus -ErrorCode $wrongCode -ExpectedStatusCode $expectedStatus
    }
}

$syntheticCredentials = @{
    technician = @{ user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
    manager = @{ user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
}
$precheckNames = @(
    'anonymous_denied', 'reporter_evaluation_denied', 'technician_evaluation_denied',
    'inactive_evaluation_denied', 'cross_tenant_evaluation_denied', 'cross_tenant_visibility_denied',
    'unauthorized_queues_exclude_case', 'governance_not_yet_evaluated'
)
function New-SyntheticCase {
    $prechecks = @{}
    foreach ($checkName in $precheckNames) { $prechecks[$checkName] = $true }
    return @{
        format = 'mutqan-hosted-governance-bridge-case-v1'
        phase = 'prepared_for_hosted_ui'
        project_ref = $ExpectedProjectRef
        deployment_id = $DeploymentId
        deployment_url = $DeploymentUrl
        bridge_git_sha = $bridgeGitSha
        tenant_id = $tenantA
        work_order_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        assigned_to = $syntheticCredentials.technician.user_id
        expected_approver = $syntheticCredentials.manager.user_id
        prepared_utc = '20200102T030405678Z'
        work_order_code = 'BRG-200102T030405'
        pre_ui_checks = $prechecks
    }
}

$identityFailure = 'STOP: case manifest does not match the frozen deployment, fixture tenant, and actors.'
$timestampFailure = 'STOP: prepared case timestamp/code is invalid.'
function Invoke-PreparedCaseTest {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [scriptblock]$Mutate = {},
        [string]$ExpectedFailure = ''
    )

    $fixture = New-SyntheticCase
    & $Mutate $fixture
    # Match the production JSON deserialization shape, including omitted fields.
    $caseRecord = $fixture | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    $failure = $null
    $result = $null
    try {
        $result = Assert-PreparedCase -Case $caseRecord -Credentials $syntheticCredentials
    } catch {
        $failure = $_.Exception.Message
    }
    if ($ExpectedFailure) {
        if ($failure -cne $ExpectedFailure) { throw "FAIL $Name (expected exact manifest rejection): $failure" }
    } else {
        if ($null -ne $failure -or $result -isnot [DateTimeOffset] -or
            $result.ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture) -cne '2020-01-02T03:04:05.6780000+00:00') {
            throw "FAIL $Name (expected valid case and UTC timestamp): $failure"
        }
    }
    $script:testCount++
    Write-Output "PASS $Name"
}

Invoke-PreparedCaseTest 'valid prepared case'
Invoke-PreparedCaseTest 'valid previously verified case' { param($f) $f.phase = 'hosted_ui_verified' }
Invoke-PreparedCaseTest 'wrong manifest format' { param($f) $f.format = 'other-format' } $identityFailure
Invoke-PreparedCaseTest 'wrong manifest phase' { param($f) $f.phase = 'unprepared' } $identityFailure
Invoke-PreparedCaseTest 'wrong project' { param($f) $f.project_ref = 'syntheticwrongproject' } $identityFailure
Invoke-PreparedCaseTest 'wrong deployment id' { param($f) $f.deployment_id = 'dpl_SyntheticWrongDeployment' } $identityFailure
Invoke-PreparedCaseTest 'wrong deployment URL' { param($f) $f.deployment_url = 'https://synthetic-wrong-deployment.invalid' } $identityFailure
Invoke-PreparedCaseTest 'wrong bridge SHA' { param($f) $f.bridge_git_sha = '0000000000000000000000000000000000000000' } $identityFailure
Invoke-PreparedCaseTest 'wrong fixture tenant' { param($f) $f.tenant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } $identityFailure
Invoke-PreparedCaseTest 'wrong assigned technician' { param($f) $f.assigned_to = $syntheticCredentials.manager.user_id } $identityFailure
Invoke-PreparedCaseTest 'wrong expected approver' { param($f) $f.expected_approver = $syntheticCredentials.technician.user_id } $identityFailure
Invoke-PreparedCaseTest 'malformed work order id' { param($f) $f.work_order_id = 'not-a-uuid' } $identityFailure
Invoke-PreparedCaseTest 'work order id query injection' { param($f) $f.work_order_id += '&or=(tenant_id.not.is.null)' } $identityFailure
Invoke-PreparedCaseTest 'work order id filter injection' { param($f) $f.work_order_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc,tenant_id.not.is.null' } $identityFailure
Invoke-PreparedCaseTest 'missing work order id' { param($f) $f.Remove('work_order_id') } $identityFailure
Invoke-PreparedCaseTest 'invalid timestamp format' { param($f) $f.prepared_utc = '2020-01-02T03:04:05.678Z' } $timestampFailure
Invoke-PreparedCaseTest 'impossible timestamp date' { param($f) $f.prepared_utc = '20200230T030405678Z' } $timestampFailure
Invoke-PreparedCaseTest 'missing timestamp' { param($f) $f.Remove('prepared_utc') } $timestampFailure
Invoke-PreparedCaseTest 'future timestamp with matching code' { param($f) $f.prepared_utc = '99991231T235959999Z'; $f.work_order_code = 'BRG-991231T235959' } $timestampFailure
Invoke-PreparedCaseTest 'wrong work order code' { param($f) $f.work_order_code = 'BRG-200102T030406' } $timestampFailure
Invoke-PreparedCaseTest 'missing work order code' { param($f) $f.Remove('work_order_code') } $timestampFailure
foreach ($precheckName in $precheckNames) {
    $expectedFailure = "STOP: prepared case has no successful $precheckName check."
    Invoke-PreparedCaseTest "missing $precheckName" { param($f) $f.pre_ui_checks.Remove($precheckName) } $expectedFailure
    Invoke-PreparedCaseTest "false $precheckName" { param($f) $f.pre_ui_checks[$precheckName] = $false } $expectedFailure
    Invoke-PreparedCaseTest "string true $precheckName" { param($f) $f.pre_ui_checks[$precheckName] = 'true' } $expectedFailure
    Invoke-PreparedCaseTest "string false $precheckName" { param($f) $f.pre_ui_checks[$precheckName] = 'false' } $expectedFailure
    Invoke-PreparedCaseTest "numeric $precheckName" { param($f) $f.pre_ui_checks[$precheckName] = 1 } $expectedFailure
}
Invoke-PreparedCaseTest 'missing precheck object' { param($f) $f.Remove('pre_ui_checks') } 'STOP: prepared case has no successful anonymous_denied check.'

if ($networkAttempts -ne 0) { throw 'FAIL: a guard attempted network access.' }
Write-Output "PASS: $testCount offline cases; no production or network requests made."
