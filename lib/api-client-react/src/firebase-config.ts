import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  projectId: "radio-indoor-replit",
  appId: "1:249128869980:web:1b1bf4232ed2d42e7b0699",
  storageBucket: "radio-indoor-replit.firebasestorage.app",
  apiKey: "AIzaSyBjDVbx-p-MA53NMpPEJOh9LBpgRAvWV5Y",
  authDomain: "radio-indoor-replit.firebaseapp.com",
  messagingSenderId: "249128869980",
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

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const isDev = isDevEnvironment();
export const firestore = isDev ? getFirestore(app, "radio-indoor-dev") : getFirestore(app);
export const storage = getStorage(app);

