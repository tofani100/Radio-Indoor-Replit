import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const prodFirebaseConfig = {
  projectId: "radio-indoor-replit",
  appId: "1:249128869980:web:1b1bf4232ed2d42e7b0699",
  storageBucket: "radio-indoor-replit.firebasestorage.app",
  apiKey: "AIzaSyBjDVbx-p-MA53NMpPEJOh9LBpgRAvWV5Y",
  authDomain: "radio-indoor-replit.firebaseapp.com",
  messagingSenderId: "249128869980",
};

export const devFirebaseConfig = {
  projectId: "radio-indoor-dev",
  appId: "1:653163372318:web:319e99a7e15ea4e1a1330f",
  storageBucket: "radio-indoor-dev.firebasestorage.app",
  apiKey: "AIzaSyD9VWMhY1YSXezGrZiTzBl33pibu3KZw9k",
  authDomain: "radio-indoor-dev-92858.firebaseapp.com",
  messagingSenderId: "653163372318",
};

export function isDevEnvironment(): boolean {
  if (typeof window !== "undefined") {
    const search = window.location.search;
    if (search.includes("env=prod")) return false;
    if (search.includes("env=dev")) return true;
    try {
      const forced = localStorage.getItem("radio_indoor_force_env");
      if (forced === "prod") return false;
      if (forced === "dev") return true;
    } catch {}

    const host = window.location.hostname.toLowerCase();
    if (host.includes("radio-indoor-dev")) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
  }
  try {
    if (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_APP_ENV === "dev") {
      return true;
    }
  } catch {}
  return false;
}

export const isDev = isDevEnvironment();
export const firebaseConfig = isDev ? devFirebaseConfig : prodFirebaseConfig;
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const storage = getStorage(app);


