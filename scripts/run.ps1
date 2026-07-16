$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:PYTHONPATH = Join-Path $projectRoot "src"

$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $python = "py"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $python = "python"
} else {
    throw "Python 3.11 이상을 찾지 못했습니다."
}

# python-holidays가 없으면 설치를 시도한다. 네트워크가 없거나 설치가 실패해도
# 앱은 2020~2050년 내장 대한민국 공휴일 데이터로 계속 실행된다.
& $python -c "import holidays" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "대한민국 공휴일 라이브러리를 설치합니다..."
    & $python -m pip install --disable-pip-version-check --quiet "holidays>=0.100,<1"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "holidays 설치에 실패해 내장 공휴일 데이터를 사용합니다."
    }
}

& $python -m daymark.main @args
