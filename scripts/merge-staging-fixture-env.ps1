param(
    [string]$Target = ".env.local",
    [string]$Fixture = ".env.staging-fixtures.local"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Fixture)) {
    throw "Missing $Fixture. Run npm run prepare:staging-fixtures first."
}

function Read-EnvFile([string]$Path) {
    $ordered = [ordered]@{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $ordered
    }

    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if ($line.Trim().Length -eq 0 -or $line.TrimStart().StartsWith("#") -or -not $line.Contains("=")) {
            continue
        }

        $parts = $line.Split("=", 2)
        $ordered[$parts[0].Trim()] = $parts[1]
    }

    return $ordered
}

$targetValues = Read-EnvFile $Target
$fixtureValues = Read-EnvFile $Fixture

foreach ($key in $fixtureValues.Keys) {
    $targetValues[$key] = $fixtureValues[$key]
}

$lines = @(
    "# Generated/updated by scripts/merge-staging-fixture-env.ps1",
    "# Contains local staging validation secrets. Do not commit."
)

foreach ($key in $targetValues.Keys) {
    $lines += "$key=$($targetValues[$key])"
}

Set-Content -LiteralPath $Target -Value $lines -Encoding UTF8
Write-Host "Merged fixture variables into $Target without printing secret values."
