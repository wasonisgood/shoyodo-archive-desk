# 將 installer\publish 內的 latest.json 與安裝檔發佈為 GitHub Release v<版本>
# 先執行 build_installer.ps1；需已登入 gh（gh auth login）
param([switch]$Draft)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$release = Get-Content "$scriptDir\release.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest = Get-Content "$scriptDir\publish\latest.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$pkgVersion = (Get-Content "$rootDir\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($manifest.version -ne $pkgVersion) { throw "publish\latest.json 是 v$($manifest.version)，但 package.json 是 v$pkgVersion，請先重新執行 build_installer.ps1" }

$exe = Join-Path "$scriptDir\publish" $release.installerFileName
if ((Get-FileHash $exe -Algorithm SHA256).Hash.ToLower() -ne $manifest.sha256) { throw "安裝檔與 latest.json 的 SHA-256 不符，請重新建置" }

$tag = "v$($manifest.version)"
$notesFile = Join-Path $env:TEMP "shoyodo-release-notes.md"
$body = "## 更新內容`n`n$($release.notes.zh)`n`n## 更新内容（日本語）`n`n$($release.notes.ja)`n`n---`n強制更新：$($manifest.mandatory)　最低支援版本：v$($manifest.minimumVersion)`nSHA-256：``$($manifest.sha256)``"
[IO.File]::WriteAllText($notesFile, $body, (New-Object Text.UTF8Encoding($false)))

$ghArgs = @('release', 'create', $tag, $exe, "$scriptDir\publish\latest.json", '-R', $release.githubRepo, '--title', "蕉葉堂 巡回台帳 $tag", '--notes-file', $notesFile, '--latest')
if ($Draft) { $ghArgs += '--draft' }
& gh @ghArgs
if ($LASTEXITCODE -ne 0) { throw "gh release create 失敗" }
Write-Host "Published $tag to https://github.com/$($release.githubRepo)/releases/tag/$tag"
