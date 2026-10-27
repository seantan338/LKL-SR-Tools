<#
.SYNOPSIS
  One-click local setup for ai_backend on Windows.

.DESCRIPTION
  1. Finds a standalone Python 3.12 (installs it with winget if missing).
  2. Creates ai_backend\.venv from it and installs requirements.txt.
  3. With -RemoveHermes: stops Hermes Agent processes, deletes %LOCALAPPDATA%\hermes
     and removes its PATH entries. Lists everything first and asks for confirmation.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup_local.ps1
  powershell -ExecutionPolicy Bypass -File .\setup_local.ps1 -RemoveHermes
#>
param(
    [switch]$RemoveHermes,
    [switch]$RecreateVenv,
    [string]$PythonVersion = "3.12"
)

$ErrorActionPreference = "Stop"
$BackendDir = $PSScriptRoot
$HermesDir = Join-Path $env:LOCALAPPDATA "hermes"
$VenvDir = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Update-SessionPath {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

function Test-HermesPath($p) {
    return [bool]($p -and ($p.StartsWith($HermesDir, [StringComparison]::OrdinalIgnoreCase) -or $p -match '(?i)hermes-agent'))
}

function Find-Python {
    # Native stderr ("No suitable Python runtime found") must not abort the script
    $ErrorActionPreference = "Continue"
    $candidates = @()
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        try {
            $exe = & $py.Source "-$PythonVersion" -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $exe) { $candidates += "$exe".Trim() }
        } catch { }
    }
    $verDigits = $PythonVersion -replace '\.', ''
    $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Python\Python$verDigits\python.exe")
    $candidates += (Join-Path $env:ProgramFiles "Python$verDigits\python.exe")
    foreach ($exe in $candidates) {
        # Never build on an interpreter that lives inside Hermes' folder
        if ($exe -and (Test-Path $exe) -and -not (Test-HermesPath $exe)) { return $exe }
    }
    return $null
}

# --- 1. Python ---------------------------------------------------------------
Write-Step "Looking for a standalone Python $PythonVersion"
$Python = Find-Python
if (-not $Python) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "Python $PythonVersion not found and winget is unavailable. Install it from https://www.python.org/downloads/ and re-run."
    }
    Write-Host "Installing Python $PythonVersion with winget..."
    winget install --id "Python.Python.$PythonVersion" -e --scope user --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "winget install failed (exit $LASTEXITCODE)" }
    Update-SessionPath
    $Python = Find-Python
    if (-not $Python) { throw "Python $PythonVersion was installed but not found. Open a new PowerShell window and re-run." }
}
Write-Host "Using $Python"

# --- 2. Virtual environment --------------------------------------------------
if ((Test-Path $VenvPython) -and -not $RecreateVenv) {
    # A .venv built from another interpreter (e.g. Hermes' Python) breaks once that interpreter is gone
    $homeLine = Get-Content (Join-Path $VenvDir "pyvenv.cfg") -ErrorAction SilentlyContinue | Where-Object { $_ -match '^home\s*=' } | Select-Object -First 1
    $venvHome = if ($homeLine) { ($homeLine -split '=', 2)[1].Trim() } else { "" }
    if ($venvHome -ne (Split-Path $Python)) {
        Write-Host "Existing .venv was built from '$venvHome', rebuilding it with $Python"
        $RecreateVenv = $true
    }
}
if ($RecreateVenv -and (Test-Path $VenvDir)) {
    Remove-Item -Recurse -Force $VenvDir
}
if (-not (Test-Path $VenvPython)) {
    Write-Step "Creating $VenvDir"
    & $Python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { throw "python -m venv failed (exit $LASTEXITCODE)" }
}

Write-Step "Installing ai_backend requirements into .venv"
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "pip install failed (exit $LASTEXITCODE)" }
& $VenvPython -c "import firebase_admin, googleapiclient, fastapi; print('Dependencies OK')"
if ($LASTEXITCODE -ne 0) { throw "Dependency check failed" }

if (-not (Test-Path (Join-Path $BackendDir "firebase-service-account.json"))) {
    Write-Warning "ai_backend\firebase-service-account.json not found - Firestore imports need it."
}

# --- 3. Remove Hermes Agent (optional) -----------------------------------------
if ($RemoveHermes) {
    Write-Step "Removing Hermes Agent"
    $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try { Test-HermesPath $_.Path } catch { $false }
    })
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userHits = @(($userPath -split ';') | Where-Object { Test-HermesPath $_ })
    $machineHits = @(($machinePath -split ';') | Where-Object { Test-HermesPath $_ })
    $configDir = Join-Path $env:USERPROFILE ".hermes"

    if (-not (Test-Path $HermesDir) -and $procs.Count -eq 0 -and $userHits.Count -eq 0 -and $machineHits.Count -eq 0) {
        Write-Host "Hermes Agent not found - nothing to remove."
    } else {
        Write-Host "This will:"
        if (Test-Path $HermesDir) { Write-Host "  - delete $HermesDir" }
        foreach ($p in $procs) { Write-Host "  - stop process $($p.Name) (PID $($p.Id)) $($p.Path)" }
        foreach ($p in $userHits) { Write-Host "  - remove user PATH entry $p" }
        foreach ($p in $machineHits) { Write-Host "  - remove system PATH entry $p" }
        if (Test-Path $configDir) {
            Write-Host "  (keeping $configDir - it may hold API keys / memory; delete it yourself if not needed)"
        }
        $answer = Read-Host "Type YES to continue"
        if ($answer -ne "YES") {
            Write-Host "Skipped Hermes removal."
        } else {
            $procs | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            if ($userHits.Count -gt 0) {
                $kept = ($userPath -split ';') | Where-Object { $_ -and -not (Test-HermesPath $_) }
                [Environment]::SetEnvironmentVariable("Path", ($kept -join ';'), "User")
            }
            if ($machineHits.Count -gt 0) {
                $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
                if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
                    $kept = ($machinePath -split ';') | Where-Object { $_ -and -not (Test-HermesPath $_) }
                    [Environment]::SetEnvironmentVariable("Path", ($kept -join ';'), "Machine")
                } else {
                    Write-Warning "System PATH still has Hermes entries. Re-run this script as Administrator to remove them."
                }
            }
            if (Test-Path $HermesDir) { Remove-Item -Recurse -Force $HermesDir }
            Update-SessionPath
            Write-Host "Hermes Agent removed." -ForegroundColor Green
        }
    }
}

Write-Step "Done"
Write-Host "Sync job orders from the sheet (dry run, then write):"
Write-Host "  .\sync_job_orders.ps1"
Write-Host "  .\sync_job_orders.ps1 -Apply"
Write-Host "Open a NEW PowerShell window so 'python' no longer points at Hermes."
