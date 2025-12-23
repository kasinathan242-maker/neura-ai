# NEURA AI

A production-ready AI-powered study and productivity ecosystem.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- Flutter SDK (latest)

### 1. Backend Setup (FastAPI)
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Server will start at `http://localhost:8000`.

### 2. Web Frontend Setup (React)
```bash
cd web
npm install
npm run dev
```
App will start at `http://localhost:5173`.

### 3. Mobile App Setup (Flutter)
```bash
cd mobile
flutter pub get
flutter run
```
Ensure you have an emulator running or a device connected.

## 🌟 Features
- **Zero Auth**: Open and use immediately.
- **Real-time AI Chat**: WebSocket powered low-latency chat.
- **Premium UI**: Glassmorphism, animations, and dark mode.
- **Multi-platform**: Web and Mobile.

## 📁 Structure
- `/backend`: Python FastAPI AI Server.
- `/web`: React + Vite Frontend.
- `/mobile`: Flutter Codebase.

## 🛠 Tech Stack
- **Frontend**: React, Vite, TailwindCSS, Zustand, Framer Motion
- **Mobile**: Flutter, Riverpod, GoRouter
- **Backend**: FastAPI, WebSockets
