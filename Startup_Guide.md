# NEURA AI - Setup Guide

## System Status
- **Frontend**: http://localhost:5174 (Running)
- **Backend**: http://localhost:8001 (Running)
- **AI Engine**: Offline Mode (Mock AI active until Ollama is installed)

## 🚀 How to Run the App (Restart Instructions)

If you need to restart the application, follow these exact steps:

### 1. Start the Backend
Open a terminal in the root directory and run:
```powershell
cd backend
& "C:\Users\mohan\AppData\Local\Programs\Python\Python312\python.exe" main.py
```
*Port changed to 8001 to avoid conflicts.*

### 2. Start the Frontend
Open a new terminal and run:
```powershell
cd web
npm run dev
```
*Access at http://localhost:5174*

## 🧠 Handling the AI Connection (Ollama)

The app is currently in **Offline Mode** because Ollama is not detected.
To enable full AI features:

1.  Download Ollama from [ollama.com](https://ollama.com).
2.  Install and run it (it defaults to port 11434).
3.  Pull the model: `ollama pull mistral`
4.  Restart the NEURA AI backend.

The app will seemingly switch from "Offline Mode" to full AI mode once it detects Ollama.

## ✅ Verified Features
- **Dashboard**: Full overview of stats.
- **Task Manager**: Add/Edit/Complete tasks.
- **Notes**: Create, Edit, and Save notes.
- **Voice Assistant**: Responsive interface (Mock mode).
- **Study/Coding/PDF**: All pages render correctly.
