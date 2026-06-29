#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Initialize git and push GenXQR to GitHub.

.PARAMETER RepoUrl
  GitHub HTTPS or SSH URL.  e.g. https://github.com/you/genx-qr.git
  If omitted the script will prompt for it.

.PARAMETER Branch
  Target branch name. Default: main

.PARAMETER Message
  Commit message. Default: "Initial commit"

.EXAMPLE
  .\push-to-github.ps1 -RepoUrl https://github.com/you/genx-qr.git
#>

param(
  [string]$RepoUrl,
  [string]$Branch  = "main",
  [string]$Message = "Initial commit"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Info  { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }
function OK    { param($msg) Write-Host "  ✔  $msg" -ForegroundColor Green }
function Warn  { param($msg) Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Fail  { param($msg) Write-Host "`n  ✖  $msg`n" -ForegroundColor Red; exit 1 }
function Step  { param($msg) Write-Host "`n● $msg" -ForegroundColor White }

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────┐" -ForegroundColor DarkMagenta
Write-Host "  │       GenXQR  →  GitHub  Pusher        │" -ForegroundColor Magenta
Write-Host "  └─────────────────────────────────────────┘" -ForegroundColor DarkMagenta
Write-Host ""

# ── Resolve project root ──────────────────────────────────────────────────────
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot
Info "Project root: $ProjectRoot"

# ── Prerequisite: git ─────────────────────────────────────────────────────────
Step "Checking prerequisites"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "git is not installed or not in PATH. Install from https://git-scm.com"
}
$gitVersion = git --version
OK "Found: $gitVersion"

# ── Safety: scan for .env files that would be committed ───────────────────────
Step "Scanning for sensitive files"

$untracked = @()
Get-ChildItem -Recurse -File -Filter ".env*" | Where-Object {
  $_.FullName -notmatch "node_modules" -and $_.FullName -notmatch "\.git\\"
} | ForEach-Object {
  $relative = $_.FullName.Substring($ProjectRoot.Length + 1).Replace("\", "/")
  git check-ignore -q $relative 2>$null
  if ($LASTEXITCODE -ne 0) { $untracked += $relative }
}

if ($untracked.Count -gt 0) {
  Warn "The following .env files are NOT covered by .gitignore and would be committed:"
  $untracked | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  Write-Host ""
  $ans = Read-Host "  Abort? [Y/n]"
  if ($ans -eq "" -or $ans -match "^[Yy]") { Fail "Aborted to protect secrets. Add the files to .gitignore first." }
}
else {
  OK "No exposed .env files detected"
}

# ── Warn on large files ────────────────────────────────────────────────────────
$largeFiles = Get-ChildItem -Recurse -File | Where-Object {
  $_.Length -gt 50MB -and $_.FullName -notmatch "node_modules" -and $_.FullName -notmatch "\.git\\"
}
if ($largeFiles) {
  Warn "Files >50 MB found (GitHub will reject files >100 MB):"
  $largeFiles | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 1)
    Write-Host "    $($_.FullName.Substring($ProjectRoot.Length+1))  ($mb MB)" -ForegroundColor Yellow
  }
}

# ── Git init (idempotent) ─────────────────────────────────────────────────────
Step "Initialising git repository"
if (Test-Path (Join-Path $ProjectRoot ".git")) {
  OK "Already a git repository — skipping init"
} else {
  git init --initial-branch=$Branch | Out-Null
  OK "git init complete (branch: $Branch)"
}

# ── Stage all files ───────────────────────────────────────────────────────────
Step "Staging files"
git add -A
$staged = git diff --cached --stat
if (-not $staged) {
  Warn "Nothing to commit. The working tree is clean."
  exit 0
}
Write-Host ""
Write-Host $staged -ForegroundColor DarkGray
Write-Host ""
OK "Files staged"

# ── Commit ────────────────────────────────────────────────────────────────────
Step "Creating commit"

# Configure identity if not set (needed in CI / fresh machines)
$name  = git config user.name  2>$null
$email = git config user.email 2>$null
if (-not $name)  { git config user.name  "GenXQR Dev" }
if (-not $email) { git config user.email "dev@genxqr.dev" }

$existing = git log --oneline 2>$null
if ($existing) {
  OK "Commits already exist — skipping initial commit (will push current branch)"
} else {
  git commit -m $Message | Out-Null
  OK "Commit created: `"$Message`""
}

# ── GitHub remote ─────────────────────────────────────────────────────────────
Step "Configuring remote"

if (-not $RepoUrl) {
  Write-Host ""
  Write-Host "  Enter your GitHub repository URL." -ForegroundColor Cyan
  Write-Host "  Example: https://github.com/yourusername/genx-qr.git" -ForegroundColor DarkGray
  Write-Host "  (Create the repo on GitHub first — empty, no README)" -ForegroundColor DarkGray
  Write-Host ""
  $RepoUrl = Read-Host "  GitHub URL"
}

if (-not $RepoUrl) { Fail "No repository URL provided." }

$remotes = git remote 2>$null
if ($remotes -contains "origin") {
  $current = git remote get-url origin 2>$null
  if ($current -ne $RepoUrl) {
    Warn "Remote 'origin' already points to: $current"
    $ans = Read-Host "  Update to $RepoUrl? [Y/n]"
    if ($ans -eq "" -or $ans -match "^[Yy]") {
      git remote set-url origin $RepoUrl
      OK "Remote updated"
    }
  } else {
    OK "Remote 'origin' already correct: $RepoUrl"
  }
} else {
  git remote add origin $RepoUrl
  OK "Remote 'origin' added: $RepoUrl"
}

# ── Push ──────────────────────────────────────────────────────────────────────
Step "Pushing to GitHub ($Branch)"
Write-Host ""

git push -u origin $Branch

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "  ┌─────────────────────────────────────────┐" -ForegroundColor DarkGreen
  Write-Host "  │           Push successful! 🚀            │" -ForegroundColor Green
  Write-Host "  └─────────────────────────────────────────┘" -ForegroundColor DarkGreen
  Write-Host ""
  $repoWeb = $RepoUrl -replace "\.git$","" -replace "^git@github\.com:","https://github.com/"
  Write-Host "  Repository: $repoWeb" -ForegroundColor Cyan
  Write-Host ""
} else {
  Fail "Push failed. Check the error above."
}
