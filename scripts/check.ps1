$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:PYTHONPATH = Join-Path $projectRoot "src"

if (Get-Command py -ErrorAction SilentlyContinue) {
    & py scripts/check.py
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python scripts/check.py
} else {
    throw "Python 3.11 이상을 찾지 못했습니다."
}
