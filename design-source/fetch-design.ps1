# Pulls the ProtoRWA Asset Hub design source (design.md, per-screen HTML,
# screenshots and a manifest) out of the Stitch MCP endpoint into design-source/.
#
# Usage:
#   $env:STITCH_API_KEY = '<your key>'
#   pwsh ./design-source/fetch-design.ps1
#
# The key is read from the environment on purpose. Do not hardcode it here.

param(
  [string]$Endpoint  = 'https://stitch.googleapis.com/mcp',
  [string]$ProjectId = '8207545033865805409',
  [string]$OutDir    = (Join-Path $PSScriptRoot '.')
)

$ErrorActionPreference = 'Stop'

$key = $env:STITCH_API_KEY
if (-not $key) { throw "Set STITCH_API_KEY in the environment first." }

$headers = @{
  'Accept'        = 'application/json, text/event-stream'
  'X-Goog-Api-Key' = $key
  'Content-Type'  = 'application/json'
}

$callId = 100
function Invoke-Mcp {
  param([string]$Method, [hashtable]$Params)

  $script:callId++
  $payload = @{
    jsonrpc = '2.0'
    id      = $script:callId
    method  = $Method
    params  = $Params
  } | ConvertTo-Json -Depth 12 -Compress

  $response = Invoke-WebRequest -Uri $Endpoint -Method Post -Headers $headers `
    -Body $payload -UseBasicParsing

  $envelope = $response.Content | ConvertFrom-Json
  if ($envelope.error) { throw "MCP $Method failed: $($envelope.error.message)" }

  # Tool results wrap their payload as a JSON string inside content[0].text
  $inner = $envelope.result.content[0].text
  if ($envelope.result.isError) { throw "MCP $Method returned error: $inner" }

  return ($inner | ConvertFrom-Json)
}

function Get-Slug {
  param([string]$Title)
  $slug = ($Title -replace '[^a-zA-Z0-9 _-]', '' -replace '\s+', '-').ToLower()
  if ($slug.Length -gt 60) { $slug = $slug.Substring(0, 60) }
  return $slug
}

$screensDir = Join-Path $OutDir 'screens'
New-Item -ItemType Directory -Force -Path $screensDir | Out-Null

Write-Host "Fetching project $ProjectId ..."
$project = Invoke-Mcp -Method 'tools/call' -Params @{
  name      = 'get_project'
  arguments = @{ name = "projects/$ProjectId" }
}

if ($project.designTheme.designMd) {
  $project.designTheme.designMd | Set-Content -Path (Join-Path $OutDir 'design.md') -Encoding UTF8
  Write-Host "  design.md saved"
}

# Persist the theme object too - useful for cross-checking the token layer.
$project.designTheme | ConvertTo-Json -Depth 12 |
  Set-Content -Path (Join-Path $OutDir 'design-theme.json') -Encoding UTF8

Write-Host "Listing screens ..."
$screens = (Invoke-Mcp -Method 'tools/call' -Params @{
  name      = 'list_screens'
  arguments = @{ projectId = $ProjectId }
}).screens

$manifest = @()
$index = 0

foreach ($screen in $screens) {
  $index++
  $screenId = $screen.name.Split('/')[-1]
  $slug = Get-Slug -Title $screen.title
  $base = '{0:d2}-{1}' -f $index, $slug

  Write-Host ("  [{0}/{1}] {2}" -f $index, $screens.Count, $screen.title)

  $detail = Invoke-Mcp -Method 'tools/call' -Params @{
    name      = 'get_screen'
    arguments = @{ name = $screen.name }
  }

  $entry = [ordered]@{
    index      = $index
    screenId   = $screenId
    title      = $screen.title
    deviceType = $screen.deviceType
    width      = $detail.width
    height     = $detail.height
    htmlFile   = $null
    shotFile   = $null
  }

  if ($detail.htmlCode.downloadUrl) {
    $htmlPath = Join-Path $screensDir "$base.html"
    Invoke-WebRequest -Uri $detail.htmlCode.downloadUrl -OutFile $htmlPath -UseBasicParsing
    $entry.htmlFile = "screens/$base.html"
  }

  if ($detail.screenshot.downloadUrl) {
    $shotPath = Join-Path $screensDir "$base.png"
    try {
      Invoke-WebRequest -Uri $detail.screenshot.downloadUrl -OutFile $shotPath -UseBasicParsing
      $entry.shotFile = "screens/$base.png"
    } catch {
      Write-Host "    (screenshot download skipped)"
    }
  }

  $manifest += [pscustomobject]$entry
}

$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $OutDir 'manifest.json') -Encoding UTF8
Write-Host "Done. $($screens.Count) screens -> $screensDir"
