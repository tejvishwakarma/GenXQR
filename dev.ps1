# GenXQR Daily Dev Startup Script
# Usage: .\dev.ps1
# Syncs .env WSL IP, then launches backend + frontend in split terminals.
# Starts PostgreSQL + Redis in WSL, syncs .env WSL IP, then launches backend + frontend.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$Root = $PSScriptRoot

Write-Host ""
Write-Host "=== GenXQR Dev Startup ===" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Start WSL services (PostgreSQL + Redis)
# ---------------------------------------------------------------------------
Write-Host "`n[1/3] Starting PostgreSQL and Redis in WSL..." -ForegroundColor Yellow
try {
    $pgResult    = wsl -d Debian -- bash -c "sudo -n service postgresql start 2>&1"
    $redisResult = wsl -d Debian -- bash -c "sudo -n service redis-server start 2>&1"
    $pgReady     = wsl -d Debian -- bash -c "pg_isready -h 127.0.0.1 -U genxqr 2>&1"
    $redisPong   = wsl -d Debian -- bash -c "redis-cli ping 2>&1"
    if ($redisPong -match "PONG" -and $pgReady -match "accepting") {
        Write-Host "      PostgreSQL and Redis are running." -ForegroundColor Green
    } else {
        Write-Host "      WARNING: Services may not be ready. PG: $pgReady | Redis: $redisPong" -ForegroundColor Red
    }
} catch {
    Write-Host "      WARNING: Could not start WSL services: $_" -ForegroundColor Red
}

# ---------------------------------------------------------------------------
# 2. Sync WSL2 IP into backend/.env
# ---------------------------------------------------------------------------
Write-Host "`n[2/3] Syncing WSL2 IP into backend/.env..." -ForegroundColor Yellow
try {
    Push-Location $Root
    pnpm wsl:sync-ip
    Write-Host "      .env updated." -ForegroundColor Green
    Pop-Location
} catch {
    Write-Host "      WARNING: IP sync failed - .env may have stale IP." -ForegroundColor Red
    Write-Host "      Error: $_" -ForegroundColor Red
    if ((Get-Location).Path -ne $Root) { Pop-Location }
}

# ---------------------------------------------------------------------------
# 2. Launch backend + frontend in new Windows Terminal tabs (or fallback to
#    separate PowerShell windows if Windows Terminal is not installed)
# ---------------------------------------------------------------------------
Write-Host "`n[3/3] Launching backend and frontend..." -ForegroundColor Yellow

$backendCmd  = "Set-Location '$Root'; pnpm dev:backend"
$frontendCmd = "Set-Location '$Root'; pnpm dev:frontend"

Start-Process powershell -ArgumentList @("-NoExit", "-Command", $backendCmd)
Start-Process powershell -ArgumentList @("-NoExit", "-Command", $frontendCmd)
Write-Host "      Opened two PowerShell windows for backend and frontend." -ForegroundColor Green

Write-Host ""
Write-Host "=== All done! ===" -ForegroundColor Cyan
Write-Host "  Backend  -> http://localhost:3001/health"
Write-Host "  Frontend -> http://localhost:5173"
Write-Host ""
Read-Host "Press Enter to close this window"
