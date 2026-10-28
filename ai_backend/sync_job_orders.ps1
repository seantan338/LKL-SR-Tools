<#
.SYNOPSIS
  One-click sync: Google Sheet "Job Order 2026" > Database -> Firestore teams/<TeamId>/job_orders.

.DESCRIPTION
  Dry run by default (writes preview.csv, changes nothing). Add -Apply to write.
  Re-running is safe: existing orders (same company + position + location) are updated, never duplicated.
  Needs ai_backend\.venv (run setup_local.ps1 once) and ai_backend\firebase-service-account.json,
  with the sheet shared to that key's client_email.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\sync_job_orders.ps1
  powershell -ExecutionPolicy Bypass -File .\sync_job_orders.ps1 -Apply
#>
param(
    [switch]$Apply,
    [string]$SheetId = "1Fc3_q77r8Eph665aqqmeDqEalRjEFBDhIZ3-F2qxYt8",
    [string]$Tab = "Database",
    [string]$TeamId = "default_team"
)

$ErrorActionPreference = "Stop"
$VenvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$KeyFile = Join-Path $PSScriptRoot "firebase-service-account.json"

if (-not (Test-Path $VenvPython)) { throw "ai_backend\.venv not found - run .\setup_local.ps1 first." }
if (-not (Test-Path $KeyFile)) { throw "ai_backend\firebase-service-account.json not found." }
# The Firebase key can read Sheets too, once the sheet is shared with its client_email
if (-not $env:GOOGLE_SERVICE_ACCOUNT_FILE -and -not (Test-Path (Join-Path $PSScriptRoot "credentials.json"))) {
    $env:GOOGLE_SERVICE_ACCOUNT_FILE = $KeyFile
}

$cliArgs = @("import_job_orders_from_sheet.py", "--sheet-id", $SheetId, "--tab", $Tab, "--team-id", $TeamId)
if ($Apply) { $cliArgs += "--apply" } else { $cliArgs += @("--preview-csv", "preview.csv") }

Push-Location $PSScriptRoot
try {
    & $VenvPython @cliArgs
    if ($LASTEXITCODE -ne 0) { throw "Import failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}
