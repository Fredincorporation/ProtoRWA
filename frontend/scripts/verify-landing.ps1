param(
  [string]$Url = 'http://localhost:3100/'
)

$ErrorActionPreference = 'Stop'

$response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 25
$html = $response.Content

Write-Output "status:  $($response.StatusCode)"
Write-Output "length:  $($html.Length)"
Write-Output ''

# Content that must appear on the rendered landing page.
$expected = @(
  'ProtoRWA',
  'Physical Product RWAs',
  'The Manufacturing Capital Dilemma',
  'How ProtoRWA Operates',
  'Featured Production Batches',
  'Supported Industries',
  'Manufacture Without Capital Dilution',
  'HelioFrost Pro',
  'milestone-gated',
  'Contract Registry',
  'Not investment advice'
)

Write-Output 'Required content:'
$missing = 0
foreach ($needle in $expected) {
  if ($html -match [regex]::Escape($needle)) {
    Write-Output "  [yes] $needle"
  } else {
    Write-Output "  [MISSING] $needle"
    $missing++
  }
}

Write-Output ''

# Content that must NOT appear - claims the deployment cannot substantiate.
$forbidden = @(
  '2.8x ARR',
  'APY Target',
  'Foxconn',
  'SGS',
  'Intertek',
  'Chainlink',
  'Agentic Sourcing',
  '0x8849c7198e',
  'Instant Liquidity'
)

Write-Output 'Forbidden unsupported claims:'
$present = 0
foreach ($needle in $forbidden) {
  if ($html -match [regex]::Escape($needle)) {
    Write-Output "  [FAIL - present] $needle"
    $present++
  } else {
    Write-Output "  [ok - absent] $needle"
  }
}

Write-Output ''
Write-Output "missing required: $missing | unsupported claims present: $present"

if ($missing -gt 0 -or $present -gt 0) { exit 1 }
Write-Output 'LANDING PAGE OK'
