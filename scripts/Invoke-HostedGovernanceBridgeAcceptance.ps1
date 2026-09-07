<#
.SYNOPSIS
    Prepares and verifies one hosted governance-bridge acceptance case.

.DESCRIPTION
    Prepare creates one uniquely named work order inside the fixed fixture tenant,
    assigns it to the fixed fixture technician, and proves anonymous, inactive,
    unauthorized-role, and cross-tenant denials without starting the work.

    The operator then completes evaluate -> approve -> start through the hosted
    bridge UI. Verify proves the resulting database state and tenant isolation.

    Passwords are loaded from a Windows DPAPI CurrentUser envelope and are never
    printed. No service-role key is used for work-order mutations.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Prepare', 'Verify')]
    [string]$Phase,

    [Parameter(Mandatory)]
    [string]$SourceEnvPath,

    [Parameter(Mandatory)]
    [string]$CredentialBundlePath,

    [string]$CaseManifestPath,

    [Parameter(Mandatory)]
    [string]$NodePath,

    [Parameter(Mandatory)]
    [string]$VercelCliPath,

    [string]$ExpectedProjectRef = 'mzpohntjotgeeaukwnbz'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$tenantA = '11111111-1111-4111-8111-111111111111'
$tenantB = '22222222-2222-4222-8222-222222222222'
$assetCode = 'FX-A-AHU-01'
$DeploymentId = 'dpl_4cDUiAoB5qrDsDJrmUAv97uCTE98'
$DeploymentUrl = 'https://mutqan-sa-fhc7-huvut96b1-khalids-projects-ce6e36f2.vercel.app'
$bridgeGitSha = 'bd4b18874574870ba83bd0fdf9f84adc3f01e309'
$caseDescription = 'Controlled test-only Production fixture acceptance; preserve as release evidence.'

$expectedAccounts = [ordered]@{
    manager = [ordered]@{
        email = 'fixture.tenant.a.manager@mutqan.test'
        tenant_id = $tenantA
        role = 'maintenance_manager'
        is_active = $true
    }
    technician = [ordered]@{
        email = 'fixture.tenant.a.technician@mutqan.test'
        tenant_id = $tenantA
        role = 'technician'
        is_active = $true
    }
    reporter = [ordered]@{
        email = 'fixture.tenant.a.reporter@mutqan.test'
        tenant_id = $tenantA
        role = 'reporter'
        is_active = $true
    }
    tenant_b = [ordered]@{
        email = 'fixture.tenant.b.user@mutqan.test'
        tenant_id = $tenantB
        role = 'tenant_admin'
        is_active = $true
    }
    inactive = [ordered]@{
        email = 'fixture.tenant.a.inactive.technician@mutqan.test'
        tenant_id = $tenantA
        role = 'technician'
        is_active = $false
    }
}

function Read-DotEnv {
    param([Parameter(Mandatory)] [string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Environment file not found: $Path"
    }
    $map = @{}
    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { continue }
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
        if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue }
        if ($FileValues.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($FileValues[$name])) {
            return $FileValues[$name]
        }
    }
    throw "Missing required environment variable name: $($Names -join ' or ')"
}

function Read-ProtectedCredentialBundle {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$ProjectRef
    )

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $manifestPath = Join-Path (Split-Path -Parent $resolvedPath) 'fixture-credentials.manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw 'The safe credential manifest is missing.'
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $actualHash = (Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($manifest.project_ref -cne $ProjectRef -or
        $manifest.protection -cne 'Windows DPAPI CurrentUser' -or
        $manifest.protected_bundle_sha256 -cne $actualHash) {
        throw 'The protected credential bundle does not match its safe manifest.'
    }

    $envelope = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
    if ($envelope.format -cne 'mutqan-fixture-credential-envelope-v1' -or
        $envelope.project_ref -cne $ProjectRef -or
        $envelope.protection -cne 'Windows DPAPI CurrentUser') {
        throw 'The protected credential envelope has the wrong identity or format.'
    }

    [byte[]]$entropyBytes = $null
    [byte[]]$protectedBytes = $null
    [byte[]]$plainBytes = $null
    try {
        $entropyBytes = [Text.Encoding]::UTF8.GetBytes([string]$envelope.entropy_context)
        $protectedBytes = [Convert]::FromBase64String([string]$envelope.protected_json_base64)
        $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            $protectedBytes,
            $entropyBytes,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $payload = [Text.Encoding]::UTF8.GetString($plainBytes) | ConvertFrom-Json
        if ($payload.format -cne 'mutqan-fixture-credentials-v1' -or $payload.project_ref -cne $ProjectRef) {
            throw 'The decrypted credential payload has the wrong identity or format.'
        }
        return $payload
    } finally {
        foreach ($buffer in @($entropyBytes, $protectedBytes, $plainBytes)) {
            if ($null -ne $buffer) { [Array]::Clear($buffer, 0, $buffer.Length) }
        }
    }
}

function Invoke-JsonResult {
    param(
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
        $response = Invoke-RestMethod @arguments
        return [ordered]@{ Ok = $true; StatusCode = 200; Body = $response; ErrorCode = $null }
    } catch {
        $statusCode = if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            [int]$_.Exception.Response.StatusCode
        } else {
            0
        }
        $errorCode = $null
        try {
            if (-not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) {
                $errorCode = ([string]$_.ErrorDetails.Message | ConvertFrom-Json).code
            }
        } catch {
            $errorCode = $null
        }
        return [ordered]@{ Ok = $false; StatusCode = $statusCode; Body = $null; ErrorCode = $errorCode }
    }
}

function Assert-Success {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [object]$Result
    )
    if (-not $Result.Ok) {
        throw "$Name failed (HTTP $($Result.StatusCode), code=$($Result.ErrorCode))."
    }
    Write-Host "[PASS] $Name"
}

function Assert-Denied {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [object]$Result,
        [Parameter(Mandatory)] [ValidateSet(401, 403)] [int]$ExpectedStatusCode
    )
    # Current hosted contract: anon ACL rejection 401/42501; actor rejection 403/42501.
    # Missing RPCs, malformed input, rate limits, and server failures prove nothing.
    if ($Result.Ok -or $Result.StatusCode -ne $ExpectedStatusCode -or $Result.ErrorCode -cne '42501') {
        throw "$Name did not produce the expected authorization denial (HTTP $($Result.StatusCode), code=$($Result.ErrorCode))."
    }
    Write-Host "[PASS] $Name denied (HTTP $ExpectedStatusCode, SQLSTATE 42501)"
}

function New-ActorHeaders {
    param(
        [Parameter(Mandatory)] [string]$ApiKey,
        [Parameter(Mandatory)] [string]$AccessToken
    )
    return @{
        apikey = $ApiKey
        Authorization = "Bearer $AccessToken"
        Accept = 'application/json'
    }
}

function Invoke-Rpc {
    param(
        [Parameter(Mandatory)] [string]$BaseUrl,
        [Parameter(Mandatory)] [hashtable]$Headers,
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [object]$Body
    )
    return Invoke-JsonResult -Method Post -Uri "$BaseUrl/rest/v1/rpc/$Name" -Headers $Headers -Body $Body
}

function Get-QueueContains {
    param(
        [Parameter(Mandatory)] [string]$BaseUrl,
        [Parameter(Mandatory)] [hashtable]$Headers,
        [Parameter(Mandatory)] [string]$WorkOrderId
    )
    $result = Invoke-Rpc -BaseUrl $BaseUrl -Headers $Headers -Name 'get_governance_decision_queue' -Body @{}
    if (-not $result.Ok) { return [ordered]@{ Ok = $false; Contains = $false; Result = $result } }
    $contains = @($result.Body | Where-Object { $_.work_order_id -ceq $WorkOrderId }).Count -gt 0
    return [ordered]@{ Ok = $true; Contains = $contains; Result = $result }
}

function Invoke-FixtureDenialChecks {
    param([Parameter(Mandatory)] [string]$WorkOrderId)

    Assert-Denied -Name 'anonymous governance evaluation' -ExpectedStatusCode 401 -Result (
        Invoke-Rpc -BaseUrl $supabaseUrl -Headers $anonymousHeaders -Name 'evaluate_work_order_approval' -Body @{ p_work_order_id = $WorkOrderId }
    )
    foreach ($name in @('reporter', 'technician', 'inactive', 'tenant_b')) {
        Assert-Denied -Name "$name governance evaluation" -ExpectedStatusCode 403 -Result (
            Invoke-Rpc -BaseUrl $supabaseUrl -Headers $sessions[$name] -Name 'evaluate_work_order_approval' -Body @{ p_work_order_id = $WorkOrderId }
        )
    }
    Assert-Denied -Name 'anonymous governance decision queue' -ExpectedStatusCode 401 -Result (
        Invoke-Rpc -BaseUrl $supabaseUrl -Headers $anonymousHeaders -Name 'get_governance_decision_queue' -Body @{}
    )
}

function Assert-PreparedCase {
    param([Parameter(Mandatory)] [object]$Case, [Parameter(Mandatory)] [hashtable]$Credentials)

    if ($Case.format -cne 'mutqan-hosted-governance-bridge-case-v1' -or
        $Case.phase -cnotin @('prepared_for_hosted_ui', 'hosted_ui_verified') -or
        $Case.project_ref -cne $ExpectedProjectRef -or
        $Case.deployment_id -cne $DeploymentId -or
        $Case.deployment_url -cne $DeploymentUrl -or
        $Case.bridge_git_sha -cne $bridgeGitSha -or
        $Case.tenant_id -cne $tenantA -or
        $Case.work_order_id -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or
        $Case.assigned_to -cne $Credentials.technician.user_id -or
        $Case.expected_approver -cne $Credentials.manager.user_id) {
        throw 'STOP: case manifest does not match the frozen deployment, fixture tenant, and actors.'
    }
    $prepared = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParseExact([string]$Case.prepared_utc, 'yyyyMMddTHHmmssfffZ',
        [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$prepared) -or
        $prepared -gt [DateTimeOffset]::UtcNow -or
        $Case.work_order_code -cne "BRG-$(([string]$Case.prepared_utc).Substring(2, 13))") {
        throw 'STOP: prepared case timestamp/code is invalid.'
    }
    foreach ($name in @('anonymous_denied', 'reporter_evaluation_denied', 'technician_evaluation_denied',
        'inactive_evaluation_denied', 'cross_tenant_evaluation_denied', 'cross_tenant_visibility_denied',
        'unauthorized_queues_exclude_case', 'governance_not_yet_evaluated')) {
        $value = $Case.pre_ui_checks.$name
        if ($value -isnot [bool] -or -not $value) {
            throw "STOP: prepared case has no successful $name check."
        }
    }
    return $prepared
}

$envValues = Read-DotEnv -Path $SourceEnvPath
$supabaseUrl = (Get-EnvValue -FileValues $envValues -Names @('VITE_SUPABASE_URL', 'SUPABASE_URL')).TrimEnd('/')
$anonKey = Get-EnvValue -FileValues $envValues -Names @('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
if ($supabaseUrl -cne "https://$ExpectedProjectRef.supabase.co") {
    throw 'STOP: the supplied environment does not target the expected production project.'
}
$deploymentEvidence = & (Join-Path $PSScriptRoot 'Test-VercelRolloutBindings.ps1') `
    -NodePath $NodePath -VercelCliPath $VercelCliPath -DeploymentOnly `
    -ExpectedDeploymentId $DeploymentId -ExpectedGitSha $bridgeGitSha -ExpectedDeploymentUrl $DeploymentUrl
if ($deploymentEvidence.status -cne 'PASS' -or $deploymentEvidence.mode -cne 'Live' -or
    $deploymentEvidence.verificationScope -cne 'ImmutableDeploymentOnly') {
    throw 'STOP: independent live Vercel deployment verification is required.'
}

$credentialPayload = Read-ProtectedCredentialBundle -Path $CredentialBundlePath -ProjectRef $ExpectedProjectRef
$credentials = @{}
foreach ($name in $expectedAccounts.Keys) {
    $expected = $expectedAccounts[$name]
    $matches = @($credentialPayload.accounts | Where-Object { $_.email -ceq $expected.email })
    if ($matches.Count -ne 1) {
        throw "Credential bundle does not contain exactly one $name fixture identity."
    }
    $credential = $matches[0]
    if ($credential.tenant_id -cne $expected.tenant_id -or
        $credential.role -cne $expected.role -or
        [bool]$credential.is_active -ne [bool]$expected.is_active -or
        [string]::IsNullOrWhiteSpace([string]$credential.password)) {
        throw "Credential metadata mismatch for the $name fixture identity."
    }
    $credentials[$name] = $credential
}

$sessions = @{}
$authHeaders = @{
    apikey = $anonKey
    Authorization = "Bearer $anonKey"
    Accept = 'application/json'
}
foreach ($name in $expectedAccounts.Keys) {
    $credential = $credentials[$name]
    $signIn = Invoke-JsonResult `
        -Method Post `
        -Uri "$supabaseUrl/auth/v1/token?grant_type=password" `
        -Headers $authHeaders `
        -Body @{ email = $credential.email; password = $credential.password }
    Assert-Success -Name "real Auth session for $name fixture" -Result $signIn
    if ([string]::IsNullOrWhiteSpace([string]$signIn.Body.access_token) -or
        [string]$signIn.Body.user.id -cne [string]$credential.user_id) {
        throw "Auth session identity mismatch for $name fixture."
    }
    $sessions[$name] = New-ActorHeaders -ApiKey $anonKey -AccessToken $signIn.Body.access_token

    $encodedEmail = [Uri]::EscapeDataString("eq.$($credential.email)")
    $profileRead = Invoke-JsonResult `
        -Method Get `
        -Uri "$supabaseUrl/rest/v1/profiles?email=$encodedEmail&select=id,tenant_id,role,is_active" `
        -Headers $sessions[$name]
    Assert-Success -Name "RLS profile read for $name fixture" -Result $profileRead
    $profileRows = @($profileRead.Body)
    if ($profileRows.Count -ne 1 -or
        $profileRows[0].id -cne $credential.user_id -or
        $profileRows[0].tenant_id -cne $credential.tenant_id -or
        $profileRows[0].role -cne $credential.role -or
        [bool]$profileRows[0].is_active -ne [bool]$credential.is_active) {
        throw "RLS profile authority mismatch for $name fixture."
    }
}

$anonymousHeaders = @{
    apikey = $anonKey
    Authorization = "Bearer $anonKey"
    Accept = 'application/json'
}

$tenantEntitlementRead = Invoke-JsonResult `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/tenants?id=eq.$tenantA&select=id,name,slug,enabled_modules" `
    -Headers $sessions.technician
Assert-Success -Name 'fixture technician reads the exact Tenant A entitlement' -Result $tenantEntitlementRead
$tenantEntitlementRows = @($tenantEntitlementRead.Body)
if ($tenantEntitlementRows.Count -ne 1 -or
    $tenantEntitlementRows[0].id -cne $tenantA -or
    $tenantEntitlementRows[0].name -cne 'Mutqan Fixture Tenant A' -or
    $tenantEntitlementRows[0].slug -cne 'mutqan-fixture-tenant-a' -or
    $tenantEntitlementRows[0].enabled_modules.work_orders.enabled -ne $true) {
    throw 'STOP: the exact fixture tenant does not have the work_orders module enabled for hosted acceptance.'
}
Write-Host '[PASS] fixture Tenant A work-orders entitlement is enabled'

if ($Phase -ceq 'Prepare') {
    $assetRead = Invoke-JsonResult `
        -Method Get `
        -Uri "$supabaseUrl/rest/v1/assets?code=eq.$assetCode&select=id,tenant_id,building_id,criticality&limit=1" `
        -Headers $sessions.reporter
    Assert-Success -Name 'fixture reporter reads the exact test asset' -Result $assetRead
    $assetRows = @($assetRead.Body)
    if ($assetRows.Count -ne 1 -or
        $assetRows[0].tenant_id -cne $tenantA -or
        $assetRows[0].criticality -cne 'critical') {
        throw 'STOP: the fixture asset is not the exact critical Tenant A asset.'
    }
    $asset = $assetRows[0]

    $timestamp = [DateTimeOffset]::UtcNow.ToString(
        'yyyyMMddTHHmmssfffZ',
        [Globalization.CultureInfo]::InvariantCulture
    )
    $code = "BRG-$($timestamp.Substring(2, 13))"
    $create = Invoke-Rpc -BaseUrl $supabaseUrl -Headers $sessions.reporter -Name 'create_work_order' -Body @{
        p_work_order = [ordered]@{
            code = $code
            title = "Hosted governance bridge acceptance $timestamp"
            description = $caseDescription
            issue_type = 'corrective_maintenance'
            priority = 'medium'
            building_id = $asset.building_id
            asset_id = $asset.id
            due_date = [DateTimeOffset]::UtcNow.AddDays(2).ToString('o', [Globalization.CultureInfo]::InvariantCulture)
        }
    }
    Assert-Success -Name 'reporter creates one audited bridge work order' -Result $create
    $workOrder = $create.Body
    if ([string]::IsNullOrWhiteSpace([string]$workOrder.id) -or $workOrder.status -cne 'pending' -or $workOrder.tenant_id -cne $tenantA) {
        throw 'Created bridge work order has an unexpected identity or state.'
    }

    $assign = Invoke-Rpc -BaseUrl $supabaseUrl -Headers $sessions.manager -Name 'assign_work_order' -Body @{
        p_work_order_id = $workOrder.id
        p_assigned_to = $credentials.technician.user_id
        p_assigned_team = $null
        p_reason = 'Hosted governance bridge controlled acceptance'
    }
    Assert-Success -Name 'manager assigns the bridge work order to the fixture technician' -Result $assign
    if ($assign.Body.status -cne 'assigned' -or $assign.Body.assigned_to -cne $credentials.technician.user_id) {
        throw 'Bridge work-order assignment has the wrong target or state.'
    }

    Invoke-FixtureDenialChecks -WorkOrderId $workOrder.id

    $crossTenantRead = Invoke-JsonResult `
        -Method Get `
        -Uri "$supabaseUrl/rest/v1/work_orders?id=eq.$($workOrder.id)&select=id" `
        -Headers $sessions.tenant_b
    Assert-Success -Name 'cross-tenant RLS probe executes safely' -Result $crossTenantRead
    if (@($crossTenantRead.Body).Count -ne 0) {
        throw 'Cross-tenant user can see the bridge work order.'
    }
    Write-Host '[PASS] cross-tenant work-order visibility denied'

    foreach ($name in @('reporter', 'technician', 'tenant_b', 'inactive')) {
        $queueProbe = Get-QueueContains -BaseUrl $supabaseUrl -Headers $sessions[$name] -WorkOrderId $workOrder.id
        if (-not $queueProbe.Ok -or $queueProbe.Contains) {
            throw "$name unexpectedly received the bridge governance decision."
        }
        Write-Host "[PASS] $name decision queue excludes the bridge work order"
    }
    $governanceRead = Invoke-JsonResult `
        -Method Get `
        -Uri "$supabaseUrl/rest/v1/work_order_governance?work_order_id=eq.$($workOrder.id)&select=id,route_type,governance_state" `
        -Headers $sessions.manager
    Assert-Success -Name 'manager reads pre-evaluation governance state' -Result $governanceRead
    if (@($governanceRead.Body).Count -ne 0) {
        throw 'Bridge case was unexpectedly evaluated before the hosted UI step.'
    }

    $caseManifest = [ordered]@{
        format = 'mutqan-hosted-governance-bridge-case-v1'
        phase = 'prepared_for_hosted_ui'
        project_ref = $ExpectedProjectRef
        deployment_id = $DeploymentId
        deployment_url = $DeploymentUrl
        bridge_git_sha = $bridgeGitSha
        live_deployment_evidence = $deploymentEvidence
        prepared_utc = $timestamp
        tenant_id = $tenantA
        work_order_id = [string]$workOrder.id
        work_order_code = [string]$workOrder.code
        assigned_to = [string]$credentials.technician.user_id
        expected_approver = [string]$credentials.manager.user_id
        verified_utc = $null
        pre_ui_checks = [ordered]@{
            anonymous_denied = $true
            reporter_evaluation_denied = $true
            technician_evaluation_denied = $true
            inactive_evaluation_denied = $true
            cross_tenant_evaluation_denied = $true
            cross_tenant_visibility_denied = $true
            unauthorized_queues_exclude_case = $true
            governance_not_yet_evaluated = $true
        }
        post_ui_checks = $null
    }
    $outputPath = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $CredentialBundlePath).Path) "bridge-case-$timestamp.json"
    [IO.File]::WriteAllText(
        $outputPath,
        ($caseManifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )
    Write-Host 'HOSTED GOVERNANCE BRIDGE PREPARATION: PASS'
    Write-Host "Case manifest: $outputPath"
    Write-Host "Work order id: $($workOrder.id)"
    return
}

if ([string]::IsNullOrWhiteSpace($CaseManifestPath) -or -not (Test-Path -LiteralPath $CaseManifestPath -PathType Leaf)) {
    throw 'Verify requires -CaseManifestPath from the completed Prepare phase.'
}
$case = Get-Content -LiteralPath $CaseManifestPath -Raw | ConvertFrom-Json
$preparedAt = Assert-PreparedCase -Case $case -Credentials $credentials
$sourceManifestHash = (Get-FileHash -LiteralPath $CaseManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()

$workOrderRead = Invoke-JsonResult `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/work_orders?id=eq.$($case.work_order_id)&select=id,tenant_id,code,title,description,reported_by,created_by,asset_id,created_at,status,assigned_to,start_time" `
    -Headers $sessions.manager
Assert-Success -Name 'manager reads the hosted bridge work order after UI actions' -Result $workOrderRead
$workOrderRows = @($workOrderRead.Body)
if ($workOrderRows.Count -ne 1 -or
    $workOrderRows[0].tenant_id -cne $tenantA -or
    $workOrderRows[0].code -cne $case.work_order_code -or
    $workOrderRows[0].title -cne "Hosted governance bridge acceptance $($case.prepared_utc)" -or
    $workOrderRows[0].description -cne $caseDescription -or
    $workOrderRows[0].reported_by -cne $credentials.reporter.user_id -or
    $workOrderRows[0].created_by -cne $credentials.reporter.user_id -or
    $workOrderRows[0].status -cne 'in_progress' -or
    $workOrderRows[0].assigned_to -cne $credentials.technician.user_id -or
    [string]::IsNullOrWhiteSpace([string]$workOrderRows[0].start_time)) {
    throw 'Hosted UI did not leave the bridge work order in the expected started state.'
}
$assetRead = Invoke-JsonResult -Method Get `
    -Uri "$supabaseUrl/rest/v1/assets?id=eq.$($workOrderRows[0].asset_id)&select=id,tenant_id,code" -Headers $sessions.manager
Assert-Success -Name 'prepared case still belongs to the exact fixture asset' -Result $assetRead
if (@($assetRead.Body).Count -ne 1 -or $assetRead.Body[0].code -cne $assetCode -or
    $assetRead.Body[0].tenant_id -cne $tenantA -or
    [Math]::Abs(([DateTimeOffset]$workOrderRows[0].created_at - $preparedAt).TotalMinutes) -gt 2) {
    throw 'STOP: work-order asset or creation time does not match the prepared fixture case.'
}
# Re-run the precise contracts even when re-verifying a historical v1 receipt.
Invoke-FixtureDenialChecks -WorkOrderId $case.work_order_id

$governanceRead = Invoke-JsonResult `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/work_order_governance?work_order_id=eq.$($case.work_order_id)&select=id,tenant_id,route_type,governance_state,required_approver_role,decision_by,decision_at" `
    -Headers $sessions.manager
Assert-Success -Name 'manager reads the hosted governance decision' -Result $governanceRead
$governanceRows = @($governanceRead.Body)
if ($governanceRows.Count -ne 1 -or
    $governanceRows[0].tenant_id -cne $tenantA -or
    $governanceRows[0].route_type -cne 'standard' -or
    $governanceRows[0].governance_state -cne 'approved' -or
    $governanceRows[0].required_approver_role -cne 'maintenance_manager' -or
    $governanceRows[0].decision_by -cne $credentials.manager.user_id -or
    [string]::IsNullOrWhiteSpace([string]$governanceRows[0].decision_at)) {
    throw 'Hosted UI governance decision has the wrong state or authority actor.'
}
if ([DateTimeOffset]$governanceRows[0].decision_at -lt $preparedAt -or
    [DateTimeOffset]$workOrderRows[0].start_time -lt [DateTimeOffset]$governanceRows[0].decision_at) {
    throw 'STOP: governance approval and start timestamps do not follow the prepared case.'
}

$operationLogRead = Invoke-JsonResult `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/operation_logs?work_order_id=eq.$($case.work_order_id)&select=id,type,description,performed_by,created_at&order=created_at.asc" `
    -Headers $sessions.manager
Assert-Success -Name 'manager reads the bridge operation audit trail' -Result $operationLogRead
$startLogs = @($operationLogRead.Body | Where-Object {
    $_.type -ceq 'maintenance' -and
    $_.description -ceq 'Work started' -and
    $_.performed_by -ceq $credentials.technician.user_id
})
if ($startLogs.Count -lt 1) {
    throw 'No technician-authored Work started audit entry was found.'
}

$managerQueue = Get-QueueContains -BaseUrl $supabaseUrl -Headers $sessions.manager -WorkOrderId $case.work_order_id
if (-not $managerQueue.Ok -or $managerQueue.Contains) {
    throw 'Approved bridge work order remains in the manager decision queue.'
}
Write-Host '[PASS] approved case leaves the manager decision queue'

$crossTenantRead = Invoke-JsonResult `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/work_orders?id=eq.$($case.work_order_id)&select=id" `
    -Headers $sessions.tenant_b
Assert-Success -Name 'post-start cross-tenant RLS probe executes safely' -Result $crossTenantRead
if (@($crossTenantRead.Body).Count -ne 0) {
    throw 'Cross-tenant user can see the started bridge work order.'
}
Write-Host '[PASS] post-start cross-tenant work-order visibility denied'

$verifiedUtc = [DateTimeOffset]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
$case.phase = 'hosted_ui_verified'
$case.verified_utc = $verifiedUtc
$case.post_ui_checks = [ordered]@{
    status_in_progress = $true
    assigned_technician_started = $true
    governance_approved = $true
    required_role_maintenance_manager = $true
    manager_is_decision_actor = $true
    technician_start_audit_present = $true
    approved_case_left_decision_queue = $true
    cross_tenant_visibility_denied = $true
}
$case | Add-Member -NotePropertyName verification_contract -NotePropertyValue 'live_deployment_and_exact_denials_v2' -Force
$case | Add-Member -NotePropertyName live_deployment_evidence -NotePropertyValue $deploymentEvidence -Force
$case | Add-Member -NotePropertyName source_manifest_sha256 -NotePropertyValue $sourceManifestHash -Force
# Database state cannot identify the originating browser. UI observations remain
# independent evidence; this receipt proves deployment identity and database state.
$case | Add-Member -NotePropertyName proof_scope -NotePropertyValue 'Live Vercel identity, exact denial contracts, and database state; browser action provenance requires the separate observed UI evidence.' -Force
$receiptName = 'bridge-verification-' + [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssfffZ', [Globalization.CultureInfo]::InvariantCulture) + '.json'
$receiptPath = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $CaseManifestPath).Path) $receiptName
[IO.File]::WriteAllText(
    $receiptPath,
    ($case | ConvertTo-Json -Depth 10) + [Environment]::NewLine,
    [Text.UTF8Encoding]::new($false)
)

Write-Host 'GOVERNANCE BRIDGE DEPLOYMENT AND DATABASE VERIFICATION: PASS'
Write-Host "Verified receipt (original manifest preserved): $receiptPath"
