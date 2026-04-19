$ErrorActionPreference = "Stop"

$roots = @("src", "api", "supabase")
$extensions = @(".css", ".html", ".js", ".jsx", ".json", ".mjs", ".sql", ".ts", ".tsx")
$ignoredPathParts = @("\.git\", "\.claude\", "\node_modules\", "\dist\", "\build\", "\coverage\")

$fragments = @(
    "ط§",
    "ط£",
    "ط¥",
    "ط¢",
    "طھ",
    "ط¨",
    "ط¬",
    "ط­",
    "ط®",
    "ط¯",
    "ط±",
    "ط²",
    "ط³",
    "ط´",
    "طµ",
    "ط¶",
    "ط·",
    "ط¸",
    "ط¹",
    "ط؛",
    "ط©",
    "ط،",
    "طں",
    "ظپ",
    "ظ‚",
    "ظƒ",
    "ظ„",
    "ظ…",
    "ظ†",
    "ظ‡",
    "ظˆ",
    "ظٹ",
    "ظ‰",
    "â",
    "�"
)

$findings = New-Object System.Collections.Generic.List[string]

foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) {
        continue
    }

    Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
        $file = $_
        if ($extensions -notcontains $file.Extension) {
            return
        }

        foreach ($ignored in $ignoredPathParts) {
            if ($file.FullName.Contains($ignored)) {
                return
            }
        }

        $lines = Get-Content -LiteralPath $file.FullName -Encoding UTF8
        for ($i = 0; $i -lt $lines.Count; $i++) {
            foreach ($fragment in $fragments) {
                if ($lines[$i].Contains($fragment)) {
                    $preview = $lines[$i].Trim()
                    if ($preview.Length -gt 160) {
                        $preview = $preview.Substring(0, 160)
                    }
                    $findings.Add("$($file.FullName):$($i + 1) [$fragment] $preview")
                    break
                }
            }
        }
    }
}

if ($findings.Count -gt 0) {
    Write-Error "Mojibake scan failed. Suspicious fragments found:`n$($findings -join "`n")"
    exit 1
}

Write-Host "Mojibake scan passed."
