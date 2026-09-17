param(
  [string]$Base = 'http://localhost:3100'
)

$ErrorActionPreference = 'Stop'

function Invoke-AiTask {
  param([string]$Task, [string]$Prompt, [hashtable]$Context)

  $body = @{ task = $Task; prompt = $Prompt; context = $Context } | ConvertTo-Json -Depth 5

  Write-Output "=== task: $Task ==="
  try {
    $response = Invoke-WebRequest -Uri "$Base/api/ai/assist" -Method Post `
      -Headers @{ 'Content-Type' = 'application/json' } -Body $body -UseBasicParsing -TimeoutSec 90
    $payload = $response.Content | ConvertFrom-Json
    Write-Output "provider: $($payload.provider)  model: $($payload.model)"
    Write-Output ($payload.data | ConvertTo-Json -Depth 6)
  } catch {
    $ex = $_.Exception
    Write-Output "FAILED: $($ex.Message)"
    if ($ex.Response) {
      $reader = New-Object IO.StreamReader($ex.Response.GetResponseStream())
      Write-Output $reader.ReadToEnd()
    }
  }
  Write-Output ''
}

Invoke-AiTask -Task 'description' -Prompt 'Write project copy for a hardware project named HelioFrost Pro in the ENERGY category, built at a small facility in Taiwan. It is a solar-powered vaccine cold-chain refrigerator for rural clinics.' -Context @{
  title = 'HelioFrost Pro'
  category = 'ENERGY'
  location = 'Kaohsiung, TW'
}

Invoke-AiTask -Task 'milestones' -Prompt 'Propose a 3-milestone production schedule for a solar vaccine refrigerator. Total raise is 100 ETH.' -Context @{
  target = '100'
  category = 'ENERGY'
}

Invoke-AiTask -Task 'risk' -Prompt 'Identify genuine production and delivery risks for a solar-powered vaccine refrigerator built in Taiwan and shipped globally.' -Context @{
  target = '100'
  location = 'Kaohsiung, TW'
}
