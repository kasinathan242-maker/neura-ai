# Neura AI: Deployment & GitHub Guide

This guide covers how to secure your code, upload it to GitHub, and run the application locally or on a server.

## 1. Prepare for GitHub
I have already created a `.gitignore` file for you to prevent uploading junk files (like `node_modules`).

### Step 1: Initialize Git
Open your terminal in the `neura_ai` folder and run:

```bash
git init
git add .
git commit -m "Initial commit - Complete App with Voice & Timer"
```

### Step 2: Connect to GitHub
1.  Go to [GitHub.com/new](https://github.com/new) and create a repository named `neura-ai`.
2.  Copy the URL (e.g., `https://github.com/YOUR_USER/neura-ai.git`).
3.  Run these commands:

```bash
git branch -M main
git remote add origin <PASTE_YOUR_GITHUB_URL_HERE>
git push -u origin main
```

---

## 2. Startup Guide (Running the App)

### Prerequisites
- **Node.js**: [Download](https://nodejs.org/)
- **Python 3.10+**: [Download](https://www.python.org/)
- **Ollama**: [Download](https://ollama.com/)

### Start Stats
You need **3 Open Terminals**:

**Terminal 1: AI Engine**
```powershell
ollama serve
```
*(Keep this running)*

**Terminal 2: Backend**
```powershell
cd backend
# Create virtual env if new: python -m venv venv
# Activate: .\venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
*Runs on Port 8001*

**Terminal 3: Frontend**
```powershell
cd web
npm install
npm run dev
```
*Runs on Port 5173*

## 3. Accessing the App
Open your browser to: **[http://localhost:5173](http://localhost:5173)**

---

## 4. Mobile Build (Android)
To build the APK manually:

1.  Ensure **Android Studio** SDK is installed.
2.  Run the build script:
    ```powershell
    cd web
    ./build_apk.ps1
    ```
3.  APK will be in `web/android/app/build/outputs/apk/debug/`.
