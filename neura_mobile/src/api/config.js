import { Platform } from 'react-native';

// Auto-detects based on environment
const SERVER_IP = '192.168.1.2'; // Your PC's Local IP
const PORT = '8000';

const LOCALHOST = Platform.select({
    android: 'http://10.0.2.2:8000', // Emulator
    ios: 'http://localhost:8000',    // Simulator
    web: 'http://localhost:8000',    // Web Browser
    default: `http://${SERVER_IP}:${PORT}`, // Physical Device
});

export const API_URL = LOCALHOST;
export const WS_URL = API_URL.replace('http', 'ws');
