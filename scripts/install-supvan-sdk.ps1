param(
  [string]$ArchivePath = "$env:LOCALAPPDATA\Temp\SupvanT50ProWeChat.zip"
)

$ErrorActionPreference = 'Stop'
$expectedSha256 = '97A3D04A7AACC4F246311E7562B9C4946929A5CBAC42EB83962C09A14890419C'
$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
$actualSha256 = (Get-FileHash -LiteralPath $resolvedArchive -Algorithm SHA256).Hash

if ($actualSha256 -ne $expectedSha256) {
  throw "硕方 SDK 压缩包校验失败。期望 SHA256: $expectedSha256，实际: $actualSha256"
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$target = Join-Path $repositoryRoot 'miniprogram\vendor\supvan-t50-pro\SUPVANAPIT50PRO'

if (Test-Path -LiteralPath $target) {
  Write-Output "硕方 SDK 已存在：$target"
  exit 0
}

$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) (
  'sthmoving-supvan-' + [Guid]::NewGuid().ToString('N')
)

try {
  New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
  Expand-Archive -LiteralPath $resolvedArchive -DestinationPath $temporaryDirectory

  $source = Get-ChildItem -LiteralPath $temporaryDirectory -Recurse -Directory |
    Where-Object {
      $_.Name -eq 'SUPVANAPIT50PRO' -and $_.FullName -notmatch '__MACOSX'
    } |
    Sort-Object { $_.FullName.Length } |
    Select-Object -First 1

  if (-not $source) {
    throw '压缩包中未找到 SUPVANAPIT50PRO 目录'
  }

  $targetParent = Split-Path -Parent $target
  New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
  Copy-Item -LiteralPath $source.FullName -Destination $target -Recurse
  Write-Output "硕方 SDK 已安装：$target"
} finally {
  if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
  }
}
