$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$project = Join-Path $root "tools\daymark-desktop-host\daymark-desktop-host.csproj"
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if ($dotnet) {
    $dotnetPath = $dotnet.Source
} else {
    $defaultDotnet = "C:\Program Files\dotnet\dotnet.exe"
    if (-not (Test-Path -LiteralPath $defaultDotnet)) {
        throw "dotnet SDK가 필요합니다. https://dotnet.microsoft.com/download 에서 .NET 8 SDK 이상을 설치하세요."
    }
    $dotnetPath = $defaultDotnet
}
& $dotnetPath publish $project -c Release -r win-x64 --self-contained true
