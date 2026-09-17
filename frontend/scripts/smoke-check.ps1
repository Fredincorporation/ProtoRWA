param(
  [string]$Url = 'http://localhost:3100/'
)

$ErrorActionPreference = 'Stop'

try {
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
} catch {
  Write-Output "REQUEST FAILED: $($_.Exception.Message)"
  exit 1
}

Write-Output "status:  $($response.StatusCode)"
Write-Output "length:  $($response.Content.Length)"

$checks = @{
  'renders ProtoRWA heading' = 'ProtoRWA'
  'status pill class'        = 'status-pill'
  'dark background token'    = '0f141c'
  'font-display class'       = 'font-display'
}

foreach ($check in $checks.GetEnumerator()) {
  if ($response.Content -match [regex]::Escape($check.Value)) {
    Write-Output "  [yes] $($check.Key)"
  } else {
    Write-Output "  [no ] $($check.Key)"
  }
}
