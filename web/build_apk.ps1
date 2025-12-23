Write-Host "Starting Neura AI Mobile Build..." -ForegroundColor Cyan

# 1. Build Web Assets
Write-Host "Building React App..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Web build failed"; exit 1 }

# 2. Sync with Capacitor
Write-Host "Syncing with Android..." -ForegroundColor Yellow
npx cap sync
if ($LASTEXITCODE -ne 0) { Write-Error "Capacitor sync failed"; exit 1 }

# 3. Build APK
Write-Host "Compiling APK (this may take a while)..." -ForegroundColor Yellow
cd android
.\gradlew.bat assembleDebug
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Gradle build failed. Make sure Android SDK is installed and ANDROID_HOME is set."
    exit 1 
}

# 4. Success
$apkPath = "$PWD/app/build/outputs/apk/debug/app-debug.apk"
Write-Host "Build Success!" -ForegroundColor Green
Write-Host "APK Location: $apkPath" -ForegroundColor Cyan
Invoke-Item "$PWD/app/build/outputs/apk/debug"
