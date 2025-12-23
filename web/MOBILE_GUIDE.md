# Neura AI Mobile App Guide

> [!IMPORTANT]
> Your project is now a fully native-ready mobile app logic!

## 📱 Quick Start (Android)

### Option 1: One-Click Build Script (Recommended)
I've created a helper script to automate everything (Web Build -> Sync -> APK Build).

1.  Open PowerShell in `neura_ai/web`.
2.  Run:
    ```powershell
    ./build_apk.ps1
    ```
3.  The script will open the folder containing your APK (`app-debug.apk`) upon success.

### Option 2: Manual Command Line
If you prefer running commands manually:

1.  Open your terminal in `neura_ai/web/android`.
2.  Run:
    ```powershell
    ./gradlew assembleDebug
    ```
    *(Note: The first run might take a few minutes to download Gradle)*

### Option 2: Android Studio (Visual)
1.  Open **Android Studio**.
2.  Select **Open an existing project**.
3.  Navigate to `c:\Users\mohan\Downloads\neura_ai\web\android` and click OK.
4.  Click the **Run** (green wedge) button.

## 🌐 PWA (Progressive Web App)

The app is also a PWA! You can verify this by running the web server:
```bash
npm run dev
```
Open it in Chrome on Android, and you will see an "Install Neura AI" prompt (or "Add to Home Screen").

## 🔄 Updating the Mobile App

If you make changes to the React code (`src/`), run:

```bash
npm run build
npx cap sync
```

This compiles your changes and copies them to the native Android project.
