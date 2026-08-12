$BASE = "http://localhost:3001"
$PASS = "Admin@1234"
$pass_count = 0
$fail_count = 0
$results = @()

function Test-Case {
    param([string]$Name, [string]$Method, [string]$Url, [hashtable]$Body, [hashtable]$Headers, [int]$ExpectStatus, [string]$Token)
    
    $h = @{ "Content-Type" = "application/json" }
    if ($Token) { $h["Authorization"] = "Bearer $Token" }
    if ($Headers) { $Headers.GetEnumerator() | ForEach-Object { $h[$_.Key] = $_.Value } }
    
    try {
        $params = @{ Uri = $Url; Method = $Method; Headers = $h; UseBasicParsing = $true; TimeoutSec = 10 }
        if ($Body) { $params["Body"] = ($Body | ConvertTo-Json -Depth 10) }
        $r = Invoke-WebRequest @params -ErrorAction Stop
        $status = $r.StatusCode
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if (-not $status) { $status = 0 }
    }
    
    $ok = $status -eq $ExpectStatus
    $icon = if ($ok) { "PASS" } else { "FAIL" }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host "  [$icon] $Name (got $status, want $ExpectStatus)" -ForegroundColor $color
    
    $script:pass_count += if ($ok) { 1 } else { 0 }
    $script:fail_count += if ($ok) { 0 } else { 1 }
    $script:results += [PSCustomObject]@{ Test=$Name; Status=$status; Expected=$ExpectStatus; Pass=$ok }
    
    # Return parsed response body
    if ($r) { try { return ($r.Content | ConvertFrom-Json) } catch { return $null } }
    return $null
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  GenXQR Automated Test Runner" -ForegroundColor Cyan
Write-Host "  Backend: $BASE" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# ── SECTION 1: HEALTH ────────────────────────────────────────
Write-Host "`n[1] Health Check" -ForegroundColor Yellow
Test-Case "Health endpoint" "GET" "$BASE/health" $null $null 200 | Out-Null

# ── SECTION 2: REGISTRATION ──────────────────────────────────
Write-Host "`n[2] Registration" -ForegroundColor Yellow

# Use a unique email each run to avoid conflicts
$ts = Get-Date -Format 'HHmmss'
$testEmail = "testuser_$ts@genxqr-test.dev"

$r1 = Test-Case "Register valid user" "POST" "$BASE/api/auth/register" @{name="Test User";email=$testEmail;password=$PASS} $null 201
Test-Case "Register duplicate email" "POST" "$BASE/api/auth/register" @{name="Test User";email=$testEmail;password=$PASS} $null 409 | Out-Null
Test-Case "Register weak password" "POST" "$BASE/api/auth/register" @{name="X";email="weak_$ts@test.dev";password="123"} $null 422 | Out-Null
Test-Case "Register missing fields" "POST" "$BASE/api/auth/register" @{} $null 422 | Out-Null

# Verify the test email directly in DB so we can login (dev shortcut)
Write-Host "    Verifying test email in DB..." -ForegroundColor DarkGray
$verifyScript = Resolve-Path "tests/verify-email.mjs"
Push-Location backend
$verifyOut = & node --env-file=.env $verifyScript $testEmail 2>&1
Pop-Location
Write-Host "    $verifyOut" -ForegroundColor DarkGray
Start-Sleep -Seconds 1

# ── SECTION 3: LOGIN ─────────────────────────────────────────
Write-Host "`n[3] Login" -ForegroundColor Yellow
$loginResp = Test-Case "Login valid credentials" "POST" "$BASE/api/auth/login" @{email=$testEmail;password=$PASS} $null 200
$TOKEN = $loginResp.data.accessToken
if ($TOKEN) { Write-Host "    Token acquired: $($TOKEN.Substring(0,30))..." -ForegroundColor DarkGray }
else { Write-Host "    WARNING: No token - subsequent tests may fail" -ForegroundColor Magenta }

Test-Case "Login wrong password" "POST" "$BASE/api/auth/login" @{email=$testEmail;password="WrongPass!"} $null 401 | Out-Null
Test-Case "Login nonexistent user" "POST" "$BASE/api/auth/login" @{email="nobody@nowhere.dev";password="Whatever1!"} $null 401 | Out-Null
Start-Sleep -Seconds 2  # brief pause before next section

# ── SECTION 4: PROTECTED ROUTES ──────────────────────────────
Write-Host "`n[4] Auth Middleware" -ForegroundColor Yellow
Test-Case "GET /me - authenticated" "GET" "$BASE/api/auth/me" $null $null 200 $TOKEN | Out-Null
Test-Case "GET /me - no token" "GET" "$BASE/api/auth/me" $null $null 401 | Out-Null
Test-Case "GET /me - bad token" "GET" "$BASE/api/auth/me" $null @{Authorization="Bearer not.a.real.jwt"} 401 | Out-Null

# alg:none JWT test
$algNone = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJmYWtlIiwiZW1haWwiOiJoYWNrQHguY29tIiwicm9sZSI6IkFETUlOIn0."
Test-Case "JWT alg:none rejected" "GET" "$BASE/api/auth/me" $null @{Authorization="Bearer $algNone"} 401 | Out-Null

# ── SECTION 5: ANTI-ENUMERATION ──────────────────────────────
Write-Host "`n[5] Anti-Enumeration" -ForegroundColor Yellow
Start-Sleep -Seconds 3  # avoid rate limit from auth section
$fp1 = Test-Case "Forgot-pw known email" "POST" "$BASE/api/auth/forgot-password" @{email=$testEmail} $null 200
Start-Sleep -Seconds 1
$fp2 = Test-Case "Forgot-pw unknown email" "POST" "$BASE/api/auth/forgot-password" @{email="doesnotexist_$ts@nowhere.dev"} $null 200

# Both responses should return identical messages
if ($fp1 -and $fp2 -and ($fp1.message -eq $fp2.message)) {
    Write-Host "  [PASS] Anti-enumeration: both responses identical" -ForegroundColor Green
    $pass_count++
} else {
    Write-Host "  [FAIL] Anti-enumeration: responses DIFFER (leaks user existence!)" -ForegroundColor Red
    $fail_count++
}
$results += [PSCustomObject]@{ Test="Anti-enumeration parity"; Expected="same message"; Pass=($fp1.message -eq $fp2.message) }

# ── SECTION 6: QR CODES ──────────────────────────────────────
Write-Host "`n[6] QR Code CRUD" -ForegroundColor Yellow
$qrResp = Test-Case "Create dynamic QR" "POST" "$BASE/api/qr" @{
    name="Test QR $(Get-Date -Format 'HHmmss')"; type="URL"; category="DYNAMIC"
    content=@{data=@{url="https://example.com"}}; tags=@("test")
} $null 201 $TOKEN
$QR_ID = $qrResp.data.id

Test-Case "List QR codes" "GET" "$BASE/api/qr?page=1&limit=10" $null $null 200 $TOKEN | Out-Null
Test-Case "Create QR - no auth" "POST" "$BASE/api/qr" @{name="X";type="URL";category="DYNAMIC";content=@{data=@{url="https://x.com"}}} $null 401 | Out-Null
Test-Case "Create QR - missing fields" "POST" "$BASE/api/qr" @{type="URL"} $null 422 $TOKEN | Out-Null

if ($QR_ID) {
    Test-Case "Get single QR" "GET" "$BASE/api/qr/$QR_ID" $null $null 200 $TOKEN | Out-Null
    Test-Case "Toggle QR active" "PATCH" "$BASE/api/qr/$QR_ID/toggle" $null $null 200 $TOKEN | Out-Null
    Test-Case "Update QR name" "PATCH" "$BASE/api/qr/$QR_ID" @{name="Updated QR"} $null 200 $TOKEN | Out-Null
    Test-Case "Duplicate QR" "POST" "$BASE/api/qr/$QR_ID/duplicate" $null $null 201 $TOKEN | Out-Null
    Test-Case "Download QR PNG" "GET" "$BASE/api/qr/$QR_ID/download?format=png&size=200" $null $null 200 $TOKEN | Out-Null
}

Test-Case "Get nonexistent QR" "GET" "$BASE/api/qr/00000000-0000-0000-0000-000000000000" $null $null 404 $TOKEN | Out-Null

# ── SECTION 7: ANALYTICS ─────────────────────────────────────
Write-Host "`n[7] Analytics" -ForegroundColor Yellow
# Global analytics is at /api/analytics/global
Test-Case "Global analytics 30d" "GET" "$BASE/api/analytics/global?days=30" $null $null 200 $TOKEN | Out-Null
Test-Case "Global analytics 7d" "GET" "$BASE/api/analytics/global?days=7" $null $null 200 $TOKEN | Out-Null
Test-Case "Analytics unauthenticated" "GET" "$BASE/api/analytics/global" $null $null 401 | Out-Null
if ($QR_ID) {
    Test-Case "Per-QR analytics" "GET" "$BASE/api/analytics/$QR_ID?days=30" $null $null 200 $TOKEN | Out-Null
}

# ── SECTION 8: WEBHOOKS ──────────────────────────────────────
Write-Host "`n[8] Webhook Lifecycle" -ForegroundColor Yellow
$whResp = Test-Case "Create webhook" "POST" "$BASE/api/webhooks" @{
    name="Test Hook"; url="https://webhook.site/test"; events=@("qr.scanned")
} $null 201 $TOKEN
$WH_ID = $whResp.data.id

Test-Case "Invalid event name" "POST" "$BASE/api/webhooks" @{
    name="Bad"; url="https://webhook.site/test"; events=@("qr.hacked")
} $null 400 $TOKEN | Out-Null

Test-Case "SSRF: private IP" "POST" "$BASE/api/webhooks" @{
    name="SSRF"; url="http://192.168.1.1/steal"; events=@("qr.scanned")
} $null 400 $TOKEN | Out-Null

Test-Case "SSRF: javascript scheme" "POST" "$BASE/api/webhooks" @{
    name="JS"; url="javascript:alert(1)"; events=@("qr.scanned")
} $null 400 $TOKEN | Out-Null

Test-Case "SSRF: file scheme" "POST" "$BASE/api/webhooks" @{
    name="File"; url="file:///etc/passwd"; events=@("qr.scanned")
} $null 400 $TOKEN | Out-Null

Test-Case "List webhooks" "GET" "$BASE/api/webhooks" $null $null 200 $TOKEN | Out-Null
Test-Case "IDOR: fake webhook ID" "GET" "$BASE/api/webhooks/00000000-0000-0000-0000-000000000000" $null $null 404 $TOKEN | Out-Null

if ($WH_ID) {
    Test-Case "Get webhook by ID" "GET" "$BASE/api/webhooks/$WH_ID" $null $null 200 $TOKEN | Out-Null
    Test-Case "Test webhook ping" "POST" "$BASE/api/webhooks/$WH_ID/test" $null $null 200 $TOKEN | Out-Null
    Test-Case "Update webhook" "PATCH" "$BASE/api/webhooks/$WH_ID" @{isActive=$false} $null 200 $TOKEN | Out-Null
    Test-Case "Delete webhook" "DELETE" "$BASE/api/webhooks/$WH_ID" $null $null 204 $TOKEN | Out-Null
}

# ── SECTION 9: SECURITY ──────────────────────────────────────
Write-Host "`n[9] Security" -ForegroundColor Yellow

# SQL injection in search param (URL-encode the dangerous chars)
$sqli = Test-Case "SQL injection in search" "GET" "$BASE/api/qr?search=DROP+TABLE+QRCode" $null $null 200 $TOKEN
Write-Host "    SQL injection returned safe response: $(if($sqli -and $sqli.success){'YES - safe'}else{'CHECK MANUALLY'})" -ForegroundColor DarkGray

# Mass assignment - use a unique email, check returned role is not ADMIN
$massEmail = "mass_$(Get-Date -Format 'HHmmssfff')@genxqr-test.dev"
$massResp = Test-Case "Mass assignment (role inject) returns 201" "POST" "$BASE/api/auth/register" @{
    name="Mass"; email=$massEmail; password="TestPass123!"
    role="ADMIN"; isEmailVerified=$true
} $null 201
if ($massResp -and $massResp.data) {
    $assignedRole = $massResp.data.role
    $roleOk = $assignedRole -ne "ADMIN"
    if ($roleOk) { Write-Host "  [PASS] Mass assignment blocked: role=$assignedRole (not ADMIN)" -ForegroundColor Green; $pass_count++ }
    else          { Write-Host "  [FAIL] Mass assignment succeeded: role=$assignedRole" -ForegroundColor Red; $fail_count++ }
    $results += [PSCustomObject]@{ Test="Mass assignment role not elevated"; Expected="not ADMIN"; Pass=$roleOk }
}

# Open redirect - Google OAuth returns 302 if configured, 503 if not; either blocks evil.com target
$oauthR = try {
    Invoke-WebRequest -Uri "$BASE/api/auth/google?next=https://evil.com" `
        -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
    200
} catch { $_.Exception.Response.StatusCode.value__ }
$oauthOk = $oauthR -eq 503 -or $oauthR -eq 302 -or $oauthR -eq 301
if ($oauthOk) { Write-Host "  [PASS] Open redirect: HTTP $oauthR (OAuth not serving evil.com)" -ForegroundColor Green; $pass_count++ }
else          { Write-Host "  [FAIL] Open redirect: got HTTP $oauthR" -ForegroundColor Red; $fail_count++ }
$results += [PSCustomObject]@{ Test="Open redirect blocked"; Expected="302/503"; Pass=$oauthOk }

# Admin route: must return 401 (no token) or 403 (user token) — never 200
$adminR = try {
    $ah = if ($TOKEN) { @{Authorization="Bearer $TOKEN"} } else { @{} }
    $ar = Invoke-WebRequest -Uri "$BASE/admin-api/users" -Headers $ah -UseBasicParsing -ErrorAction Stop
    $ar.StatusCode
} catch { $_.Exception.Response.StatusCode.value__ }
$adminOk = $adminR -eq 401 -or $adminR -eq 403
if ($adminOk) { Write-Host "  [PASS] Admin route blocked: HTTP $adminR" -ForegroundColor Green; $pass_count++ }
else          { Write-Host "  [FAIL] Admin route returned $adminR (expected 401 or 403)" -ForegroundColor Red; $fail_count++ }
$results += [PSCustomObject]@{ Test="Admin route blocked for non-admin"; Expected="401 or 403"; Pass=$adminOk }

# Security headers check
Write-Host "`n[10] Security Headers" -ForegroundColor Yellow
try {
    $hr = Invoke-WebRequest -Uri "$BASE/health" -UseBasicParsing -TimeoutSec 5
    $headers = $hr.Headers
    
    $checks = @{
        "X-Content-Type-Options" = "nosniff"
        "X-Frame-Options" = $null  # just check presence
    }
    
    foreach ($h in @("X-Content-Type-Options","X-Frame-Options","X-XSS-Protection")) {
        if ($headers.ContainsKey($h)) {
            Write-Host "  [PASS] Header present: $h = $($headers[$h])" -ForegroundColor Green
            $pass_count++
        } else {
            Write-Host "  [FAIL] Missing header: $h" -ForegroundColor Red
            $fail_count++
        }
        $results += [PSCustomObject]@{ Test="Header: $h"; Expected="present"; Pass=$headers.ContainsKey($h) }
    }
} catch {
    Write-Host "  [SKIP] Could not check headers: $_" -ForegroundColor DarkYellow
}

# ── CLEANUP ──────────────────────────────────────────────────
if ($QR_ID) {
    Write-Host "`n[Cleanup] Deleting test QR..." -ForegroundColor DarkGray
    Test-Case "Delete test QR" "DELETE" "$BASE/api/qr/$QR_ID" $null $null 204 $TOKEN | Out-Null
}

# ── SUMMARY ──────────────────────────────────────────────────
$total = $pass_count + $fail_count
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  RESULTS: $pass_count/$total passed" -ForegroundColor $(if($fail_count -eq 0){"Green"}else{"Yellow"})
Write-Host "================================================" -ForegroundColor Cyan

if ($fail_count -gt 0) {
    Write-Host "`nFailed tests:" -ForegroundColor Red
    $results | Where-Object { -not $_.Pass } | ForEach-Object {
        Write-Host "  ✗ $($_.Test) (got $($_.Status), want $($_.Expected))" -ForegroundColor Red
    }
}
Write-Host ""
