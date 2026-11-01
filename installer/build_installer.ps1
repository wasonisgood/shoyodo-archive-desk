param(
    # 重新由 release\win-unpacked 打包 app-payload.zip（先執行 npm run dist 產生 win-unpacked）
    [switch]$RebuildPayload
)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

$wpfDir = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF'
$netDir = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$icoPath = "$rootDir\app.ico"

# 0. 版本與更新設定：版本取自 package.json，更新來源與發版說明取自 installer\release.json
$pkg = Get-Content "$rootDir\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $pkg.version
$release = Get-Content "$scriptDir\release.json" -Raw -Encoding UTF8 | ConvertFrom-Json
# 更新清單固定指向最新 Release；安裝檔指向該版本專屬網址，確保雜湊值與檔案永遠一致
$manifestUrl = "https://github.com/$($release.githubRepo)/releases/latest/download/latest.json"
$installerUrl = "https://github.com/$($release.githubRepo)/releases/download/v$version/$($release.installerFileName)"
function CsStr([string]$s) { return '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"' }
$buildInfo = @"
// 由 build_installer.ps1 自動產生，請勿手動修改
namespace Shoyodo {
    internal static class BuildInfo {
        public const string Version = $(CsStr $version);
        public const string ManifestUrl = $(CsStr $manifestUrl);
    }
}
"@
[IO.File]::WriteAllText("$scriptDir\BuildInfo.g.cs", $buildInfo, (New-Object Text.UTF8Encoding($false)))
Write-Host "Version $version / manifest $manifestUrl"

if ($RebuildPayload) {
    $unpacked = "$rootDir\release\win-unpacked"
    if (-not (Test-Path "$unpacked\蕉葉堂巡回台帳.exe")) { throw "找不到 $unpacked，請先執行 npm run dist" }
    Write-Host "Packing app-payload.zip from win-unpacked..."
    Remove-Item "$scriptDir\app-payload.zip" -Force -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($unpacked, "$scriptDir\app-payload.zip", [IO.Compression.CompressionLevel]::Optimal, $false)
}

# 共用參照庫
$refs = @(
    "$wpfDir\PresentationFramework.dll",
    "$wpfDir\PresentationCore.dll",
    "$wpfDir\WindowsBase.dll",
    "$netDir\System.dll",
    "$netDir\System.Core.dll",
    "$netDir\System.Xaml.dll",
    "$netDir\System.Windows.Forms.dll",
    "$netDir\System.Drawing.dll",
    "$netDir\System.IO.Compression.dll",
    "$netDir\System.IO.Compression.FileSystem.dll",
    "$netDir\System.Web.Extensions.dll",
    "$netDir\Microsoft.CSharp.dll"
)
$refArgs = $refs | ForEach-Object { "/r:`"$_`"" }
$common = @("$scriptDir\UpdateCommon.cs", "$scriptDir\BuildInfo.g.cs")

function Compile($out, $sources, $extra) {
    & "$netDir\csc.exe" /nologo /target:winexe /optimize+ /platform:anycpu /utf8output /codepage:65001 /win32icon:"$icoPath" $refArgs /resource:"$icoPath",app.ico $extra /out:"$out" $sources
    if ($LASTEXITCODE -ne 0) { throw "Compile failed: $out" }
}

# 1. 解除安裝程式 (uninstall.exe)
Write-Host "Compiling uninstaller..."
Compile "$scriptDir\uninstall.exe" @("$scriptDir\UninstallerApp.cs") @()

# 2. 更新程式 (ShoyodoUpdater.exe)
Write-Host "Compiling updater..."
Compile "$scriptDir\ShoyodoUpdater.exe" (@("$scriptDir\UpdaterApp.cs") + $common) @()

# 3. 安裝程式（內嵌主程式封包、解除安裝程式、更新程式）
Write-Host "Compiling installer with embedded resources..."
$resList = @(
    "/resource:`"$scriptDir\app-payload.zip`",app-payload.zip",
    "/resource:`"$scriptDir\uninstall.exe`",uninstall.exe",
    "/resource:`"$scriptDir\ShoyodoUpdater.exe`",ShoyodoUpdater.exe"
)
$installerOut = "$rootDir\蕉葉堂巡回台帳_安裝程式.exe"
Compile $installerOut (@("$scriptDir\InstallerApp.cs") + $common) $resList
Copy-Item $installerOut "$scriptDir\蕉葉堂巡回台帳_安裝程式.exe" -Force

# 4. 發佈資料夾：上傳 installer\publish 內的兩個檔案到更新伺服器（GitHub Release）即完成發版
$publishDir = "$scriptDir\publish"
New-Item -ItemType Directory -Force $publishDir | Out-Null
$publishExe = Join-Path $publishDir $release.installerFileName
Copy-Item $installerOut $publishExe -Force
$file = Get-Item $publishExe
$sha = (Get-FileHash $publishExe -Algorithm SHA256).Hash.ToLower()
$manifest = [ordered]@{
    version        = $version
    minimumVersion = $release.minimumVersion
    mandatory      = [bool]$release.mandatory
    releaseDate    = (Get-Date -Format 'yyyy-MM-dd')
    installerUrl   = $installerUrl
    size           = $file.Length
    sha256         = $sha
    notes          = $release.notes
}
[IO.File]::WriteAllText("$publishDir\latest.json", ($manifest | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Build complete: $installerOut ($($file.Length) bytes)"
Write-Host "Publish files : $publishDir\latest.json + $($release.installerFileName)"
Write-Host "SHA-256       : $sha"
