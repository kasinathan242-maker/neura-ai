# Builds a debug APK from the web app via Capacitor.
#
#   .\build_apk.ps1
#   .\build_apk.ps1 -ApiBase "https://your-app.vercel.app/api"
#
# Requires the Android SDK with ANDROID_HOME set.

param(
    [string]$ApiBase = $env:VITE_API_BASE
)

$ErrorActionPreference = "Stop"

Write-Host "NEURA AI - Android build" -ForegroundColor Cyan

# A packaged app is served from capacitor://localhost, so a relative "/api" path
# resolves against the app bundle and every request fails. An absolute URL is
# required, and there is no dev server to proxy through.
if (-not $ApiBase) {
    Write-Host ""
    Write-Warning "VITE_API_BASE is not set."
    Write-Host "  The APK will call a relative /api path, which does not exist inside" -ForegroundColor Yellow
    Write-Host "  a packaged app. Pass a reachable absolute URL instead, for example:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host '    .\build_apk.ps1 -ApiBase "https://your-app.vercel.app/api"' -ForegroundColor Gray
    Write-Host '    .\build_apk.ps1 -ApiBase "http://192.168.1.20:8001/api"   # LAN backend' -ForegroundColor Gray
    Write-Host ""
    $answer = Read-Host "Continue anyway? (y/N)"
    if ($answer -ne "y") { exit 1 }
} else {
    Write-Host "API base: $ApiBase" -ForegroundColor Green
    $env:VITE_API_BASE = $ApiBase
}

Write-Host "`n[1/3] Building the web app..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Web build failed."; exit 1 }

Write-Host "`n[2/3] Syncing into the Android project..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Error "Capacitor sync failed."; exit 1 }

Write-Host "`n[3/3] Compiling the APK (this takes a while)..." -ForegroundColor Yellow
Push-Location android
try {
    .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Gradle build failed. Check that the Android SDK is installed and ANDROID_HOME is set."
        exit 1
    }
    $apkDir = Join-Path $PWD "app\build\outputs\apk\debug"
    Write-Host "`nBuild succeeded." -ForegroundColor Green
    Write-Host "APK: $apkDir\app-debug.apk" -ForegroundColor Cyan
    if (Test-Path $apkDir) { Invoke-Item $apkDir }
} finally {
    Pop-Location
}
