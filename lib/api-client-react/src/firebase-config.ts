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

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const storage = getStorage(app);

