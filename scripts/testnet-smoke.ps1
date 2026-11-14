param(
  [switch]$Execute,
  [string]$ContractAccount = "outlay-deployer.testnet",
  [string]$AgentAccount = "outlay-agent.testnet",
  [string]$PolicyId = "smoke-test"
)

$ErrorActionPreference = "Stop"

if (-not $Execute) {
  Write-Host "This script submits NEAR testnet transactions and spends testnet gas."
  Write-Host "Review the script, then run: .\scripts\testnet-smoke.ps1 -Execute"
  exit 0
}

if (-not (Get-Command near -ErrorAction SilentlyContinue)) {
  throw "NEAR CLI was not found in PATH."
}

function ConvertTo-NearJsonArg([object]$Value) {
  $json = ConvertTo-Json -InputObject $Value -Compress -Depth 20
  return $json.Replace('"', '\"')
}

function Invoke-NearRead([string]$Method, [object]$ArgsObject = @{}) {
  $json = ConvertTo-NearJsonArg $ArgsObject
  $arguments = @(
    "contract", "call-function", "as-read-only", $ContractAccount,
    $Method, "json-args", $json, "network-config", "testnet", "now"
  )
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $output = & near @arguments 2> $stderrPath
    $exitCode = $LASTEXITCODE
  } finally {
    $stderr = Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
  $text = (($output | Out-String) + [Environment]::NewLine + $stderr)
  if ($exitCode -ne 0 -or $text -match '(?im)^\s*(Error:|ERROR)') {
    throw ("Read-only call " + $Method + " failed:" + [Environment]::NewLine + $text)
  }

  $match = [regex]::Match($text, '(?m)Function execution return value \(printed to stdout\):\s*([^\r\n]+)')
  if (-not $match.Success) {
    $match = [regex]::Match($text, '(?m)^\s*(true|false|-?\d+)\s*$')
  }
  if (-not $match.Success) {
    throw ("Could not parse read-only result for " + $Method + ":" + [Environment]::NewLine + $text)
  }
  return $match.Groups[1].Value.Trim()
}

function Invoke-NearTransaction(
  [string]$Method,
  [object]$ArgsObject,
  [string]$Signer,
  [bool]$ExpectFailure = $false,
  [string]$Label = $Method
) {
  $json = ConvertTo-NearJsonArg $ArgsObject
  $arguments = @(
    "contract", "call-function", "as-transaction", $ContractAccount,
    $Method, "json-args", $json,
    "prepaid-gas", "100 Tgas", "attached-deposit", "0 NEAR",
    "sign-as", $Signer, "network-config", "testnet",
    "sign-with-keychain", "send"
  )
  Write-Host ""
  Write-Host ("=== " + $Label + " ===") -ForegroundColor Cyan
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $output = & near @arguments 2> $stderrPath
    $exitCode = $LASTEXITCODE
  } finally {
    $stderr = Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
  $text = (($output | Out-String) + [Environment]::NewLine + $stderr)
  Write-Host $text

  $failed = ($exitCode -ne 0) -or ($text -match "ERROR Transaction failed|WebAssembly trap|ExecutionError|FunctionCallError")
  if ($ExpectFailure -and -not $failed) {
    throw ("Expected " + $Label + " to be rejected, but the CLI did not report a failed execution.")
  }
  if (-not $ExpectFailure -and $failed) {
    throw ($Label + " should have succeeded but failed. Stop and inspect the transaction.")
  }
  if (-not $ExpectFailure -and $exitCode -ne 0) {
    throw ($Label + " returned exit code " + $exitCode + ".")
  }

  if ($ExpectFailure) { Write-Host ("PASS: rejected as expected - " + $Label) -ForegroundColor Green }
  else { Write-Host ("PASS: succeeded - " + $Label) -ForegroundColor Green }
}

function Set-SmokePolicy([bool]$Enabled, [int]$MaxTotal = 100) {
  $policy = @{
    enabled = $Enabled
    expires_at_ns = [long]2000000000000000000
    max_per_transaction = 50
    max_total = $MaxTotal
    allowed_destinations = @($AgentAccount)
  }
  Invoke-NearTransaction "set_policy" @{
    policy_id = $PolicyId
    policy = $policy
  } $ContractAccount $false ("owner sets policy enabled=" + $Enabled)
}

Write-Host "Checking the expected starting state..."
$startingSpend = Invoke-NearRead "get_policy_spend" @{ policy_id = $PolicyId }
$startingCount = Invoke-NearRead "get_decision_count"
$startingVersion = Invoke-NearRead "get_policy_version" @{ policy_id = $PolicyId }

if ($startingSpend -ne "25" -or $startingCount -ne "1" -or $startingVersion -ne "1") {
  throw ("Unexpected baseline. Expected reserved=25, decisions=1, policy version=1. Found reserved=" + $startingSpend + ", decisions=" + $startingCount + ", version=" + $startingVersion + ". Stop and inspect state before running.")
}

Write-Host "Baseline confirmed: reserved=25, decisions=1, version=1." -ForegroundColor Green
$knownNonceConsumed = Invoke-NearRead "is_nonce_consumed" @{ agent_id = $AgentAccount; nonce = "1" }
$knownIntentConsumed = Invoke-NearRead "is_intent_consumed" @{ agent_id = $AgentAccount; intent_id = "smoke-intent-001" }
$unusedNonceConsumed = Invoke-NearRead "is_nonce_consumed" @{ agent_id = $AgentAccount; nonce = "999" }
$unusedIntentConsumed = Invoke-NearRead "is_intent_consumed" @{ agent_id = $AgentAccount; intent_id = "smoke-intent-unused" }

if ($knownNonceConsumed -ne "true" -or $knownIntentConsumed -ne "true" -or $unusedNonceConsumed -ne "false" -or $unusedIntentConsumed -ne "false") {
  throw "Replay-state views are unavailable or inconsistent. Upgrade the contract and verify its read-only replay methods before running the live suite."
}

Write-Host "Replay views confirmed: known nonce and intent consumed, unused values clear." -ForegroundColor Green


# Replay the already-consumed intent with a fresh nonce, then replay a consumed nonce with a fresh intent ID.
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-intent-001"
  destination = $AgentAccount
  amount = 1
  nonce = 17
  intent_expires_at_ns = [long]1900000000000000000
} $AgentAccount $true "intent replay"

Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-nonce-replay-001"
  destination = $AgentAccount
  amount = 1
  nonce = 1
  intent_expires_at_ns = [long]1900000000000000000
} $AgentAccount $true "nonce replay"

# The only additional successful spend. It raises the reservation total from 25 to 75.
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-budget-fill-002"
  destination = $AgentAccount
  amount = 50
  nonce = 10
  intent_expires_at_ns = [long]1900000000000000000
} $AgentAccount $false "valid 50-unit authorization"

# Exceed the per-transaction cap.
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-per-tx-overflow-001"
  destination = $AgentAccount
  amount = 51
  nonce = 20
  intent_expires_at_ns = [long]1900000000000000000
} $AgentAccount $true "per-transaction limit"

# Destination is not in the policy allowlist.
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-destination-denied-001"
  destination = "unauthorized.testnet"
  amount = 10
  nonce = 21
  intent_expires_at_ns = [long]1900000000000000000
} $AgentAccount $true "destination allowlist"

# Within the per-transaction cap, but over the remaining total budget.
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-total-overflow-001"
  destination = $AgentAccount
  amount = 26
  nonce = 11
  intent_expires_at_ns = [long]1900000000000000000
} $AgentAccount $true "total budget overflow"

# The owner account is not registered as an agent.
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-unregistered-caller-001"
  destination = $AgentAccount
  amount = 1
  nonce = 12
  intent_expires_at_ns = [long]1900000000000000000
} $ContractAccount $true "unregistered caller"

# Disable and re-enable the test agent around one attempted spend.
Invoke-NearTransaction "set_agent_enabled" @{
  agent_id = $AgentAccount
  enabled = $false
} $ContractAccount $false "owner disables test agent"
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-disabled-agent-001"
  destination = $AgentAccount
  amount = 1
  nonce = 13
  intent_expires_at_ns = [long]1900000000000000000
} $AgentAccount $true "disabled agent request"
Invoke-NearTransaction "set_agent_enabled" @{
  agent_id = $AgentAccount
  enabled = $true
} $ContractAccount $false "owner re-enables test agent"

# Disable and re-enable the policy. These updates increment its version.
Set-SmokePolicy $false
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-disabled-policy-001"
  destination = $AgentAccount
  amount = 1
  nonce = 14
  intent_expires_at_ns = [long]1900000000000000000
} $AgentAccount $true "disabled policy request"
Set-SmokePolicy $true

# Expiry boundary tests.
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-expired-intent-001"
  destination = $AgentAccount
  amount = 1
  nonce = 15
  intent_expires_at_ns = [long]1
} $AgentAccount $true "expired intent"
Invoke-NearTransaction "authorize_spend" @{
  intent_id = "smoke-intent-outlives-policy-001"
  destination = $AgentAccount
  amount = 1
  nonce = 16
  intent_expires_at_ns = [long]2000000000000000001
} $AgentAccount $true "intent expiry beyond policy expiry"

# Guard against lowering the total cap below current active reservations.
Invoke-NearTransaction "set_policy" @{
  policy_id = $PolicyId
  policy = @{
    enabled = $true
    expires_at_ns = [long]2000000000000000000
    max_per_transaction = 50
    max_total = 50
    allowed_destinations = @($AgentAccount)
  }
} $ContractAccount $true "reject policy cap below existing reservations"

$finalSpend = Invoke-NearRead "get_policy_spend" @{ policy_id = $PolicyId }
$finalCount = Invoke-NearRead "get_decision_count"
$finalVersion = Invoke-NearRead "get_policy_version" @{ policy_id = $PolicyId }
if ($finalSpend -ne "75" -or $finalCount -ne "2" -or $finalVersion -ne "3") {
  throw ("Final invariant mismatch. Expected reserved=75, decisions=2, version=3. Found reserved=" + $finalSpend + ", decisions=" + $finalCount + ", version=" + $finalVersion + ".")
}

Write-Host ""
Write-Host "ALL SCRIPTED TESTNET CASES PASSED." -ForegroundColor Green
Write-Host ("Final state: reserved=" + $finalSpend + ", decisions=" + $finalCount + ", policy version=" + $finalVersion + ".")
Write-Host "Failed calls pay testnet gas but must not mutate contract state."
