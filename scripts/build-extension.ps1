[CmdletBinding()]
param(
  [string]$Version = "dev",
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\dist")
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$outputRoot = (Resolve-Path $OutputDirectory).Path
$artifactName = "paste-xray-extension-$Version.zip"
$artifactPath = Join-Path $outputRoot $artifactName
$checksumPath = "$artifactPath.sha256"
$temporaryRoot = (Resolve-Path ([System.IO.Path]::GetTempPath())).Path.TrimEnd('\')
$stagingPath = Join-Path $temporaryRoot ("paste-xray-extension-" + [guid]::NewGuid().ToString("N"))

$packageFiles = @(
  "manifest.json",
  "index.html",
  "styles.css",
  "app.js",
  "LICENSE",
  "extension\background.js",
  "extension\INSTALL.md",
  "extension\icons\icon.svg",
  "extension\icons\icon-16.png",
  "extension\icons\icon-32.png",
  "extension\icons\icon-48.png",
  "extension\icons\icon-128.png"
)

try {
  New-Item -ItemType Directory -Force -Path $stagingPath | Out-Null

  foreach ($relativePath in $packageFiles) {
    $sourcePath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Missing extension file: $relativePath"
    }

    $destinationPath = Join-Path $stagingPath $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path $destinationPath) | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
  }

  Compress-Archive -Path (Join-Path $stagingPath "*") -DestinationPath $artifactPath -Force
  $hash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $artifactName" | Set-Content -LiteralPath $checksumPath -Encoding utf8NoBOM

  Write-Output "Built: $artifactPath"
  Write-Output "SHA256: $hash"
} finally {
  if (Test-Path -LiteralPath $stagingPath) {
    $resolvedStagingPath = (Resolve-Path -LiteralPath $stagingPath).Path
    $expectedPrefix = "$temporaryRoot\paste-xray-extension-"
    if (-not $resolvedStagingPath.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove unexpected staging path: $resolvedStagingPath"
    }
    Remove-Item -LiteralPath $resolvedStagingPath -Recurse -Force
  }
}
