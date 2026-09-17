param(
  [string]$Base = 'http://localhost:3100',
  # Remaining positional arguments are treated as paths.
  #
  # Note the ordering hazard this avoids: with a positional list starting at
  # '/', PowerShell binds the FIRST argument to $Base, so `check-routes.ps1
  # '/', '/explore'` silently set Base='/explore' and every request then failed
  # with "Invalid URI: The hostname could not be parsed". The default Base is now
  # only overridden by an explicit -Base, and paths come from RemainingArguments.
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Paths = @(
    '/',
    '/explore',
    '/projects/heliofrost-pro',
    '/studio',
    '/studio/new',
    '/market',
    '/notifications',
    '/how-it-works',
    '/faq',
    '/about',
    '/terms',
    '/support'
  )
)

# Guard against a missing/blank -Base, which previously produced
# "Invalid URI: The hostname could not be parsed" and hid every result.
if ([string]::IsNullOrWhiteSpace($Base)) { $Base = 'http://localhost:3100' }
$Base = $Base.TrimEnd('/')

foreach ($path in $Paths) {
  $url = "$Base$path"
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25
    $kb = [math]::Round($response.Content.Length / 1KB)
    Write-Output "$path -> $($response.StatusCode) (${kb}KB)"
  } catch {
    Write-Output "$path -> FAILED: $($_.Exception.Message)"
  }
}
