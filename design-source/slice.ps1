param(
  [string]$File = '12-protorwa-landing-page.html',
  [string]$StartMarker = '<main',
  [string]$EndMarker = '<section id="problem"',
  [int]$Length = 3500
)

$ErrorActionPreference = 'Stop'

$path = Join-Path $PSScriptRoot $File
if (-not (Test-Path $path)) { throw "Not found: $path" }

$content = Get-Content $path -Raw

$startIndex = $content.IndexOf($StartMarker)
if ($startIndex -lt 0) { throw "Start marker not found: $StartMarker" }

$endIndex = $content.IndexOf($EndMarker, $startIndex)
if ($endIndex -lt 0) { $endIndex = [Math]::Min($startIndex + $Length, $content.Length) }

$slice = $content.Substring($startIndex, $endIndex - $startIndex)
$collapsed = $slice -replace '\s+', '

Write-Output "slice chars: $($slice.Length) (collapsed $($collapsed.Length))"
Write-Output '---'
if ($collapsed.Length -gt $Length) {
  Write-Output $collapsed.Substring(0, $Length)
} else {
  Write-Output $collapsed
}
