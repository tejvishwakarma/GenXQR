# GenXQR Daily Dev Startup Script
# Usage: .\dev.ps1
# Starts the dedicated Postgres + Redis containers (docker-compose.yml, via WSL),
# then launches backend + frontend in split PowerShell windows.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$Root = $PSScriptRoot

Write-Host ""
Write-Host "=== GenXQR Dev Startup ===" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Start GenXQR infrastructure (Postgres + Redis via docker compose in WSL)
# ---------------------------------------------------------------------------
Write-Host "`n[1/2] Starting Postgres + Redis (docker compose)..." -ForegroundColor Yellow
try {
    Push-Location $Root
    # Docker runs inside WSL; wsl inherits this Windows cwd so compose finds
    # docker-compose.yml + .env here. --wait blocks until both are healthy.
    wsl -d Debian docker compose --env-file .env up -d --wait
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Containers healthy (genxqr_postgres:5433, genxqr_redis:6380)." -ForegroundColor Green
    } else {
        Write-Host "      WARNING: docker compose exited with code $LASTEXITCODE." -ForegroundColor Red
    }
    Pop-Location
} catch {
    Write-Host "      WARNING: Could not start containers: $_" -ForegroundColor Red
    if ((Get-Location).Path -ne $Root) { Pop-Location }
}

# ---------------------------------------------------------------------------
# 2. Launch backend + frontend in separate PowerShell windows
# ---------------------------------------------------------------------------
Write-Host "`n[2/2] Launching backend and frontend..." -ForegroundColor Yellow

$backendCmd  = "Set-Location '$Root'; pnpm dev:backend"
$frontendCmd = "Set-Location '$Root'; pnpm dev:frontend"

Start-Process powershell -ArgumentList @("-NoExit", "-Command", $backendCmd)
Start-Process powershell -ArgumentList @("-NoExit", "-Command", $frontendCmd)
Write-Host "      Opened two PowerShell windows for backend and frontend." -ForegroundColor Green

Write-Host ""
Write-Host "=== All done! ===" -ForegroundColor Cyan
Write-Host "  Backend  -> http://localhost:4000/health"
Write-Host "  Frontend -> http://localhost:5173"
Write-Host ""
Read-Host "Press Enter to close this window"
