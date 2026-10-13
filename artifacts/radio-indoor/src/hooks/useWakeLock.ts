import { useEffect, useRef, useState, useCallback } from "react";

export function useWakeLock(isPlaying: boolean) {
  const [isSupported, setIsSupported] = useState(false);
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("radio_indoor_wakelock_enabled");
    return saved !== null ? saved === "true" : false;
  });
  const [isActive, setIsActive] = useState(false);
  const sentinelRef = useRef<any>(null);

  useEffect(() => {
    setIsSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (!enabled || !isPlaying) return;
    if (sentinelRef.current && !sentinelRef.current.released) return;

    try {
      const lock = await (navigator as any).wakeLock.request("screen");
      sentinelRef.current = lock;
      setIsActive(true);
      lock.addEventListener("release", () => {
        setIsActive(false);
        sentinelRef.current = null;
      });
    } catch (err) {
      console.warn("[WakeLock] Não foi possível adquirir Wake Lock:", err);
      setIsActive(false);
    }
  }, [enabled, isPlaying]);

  const releaseWakeLock = useCallback(() => {
    if (sentinelRef.current) {
      try {
        sentinelRef.current.release();
      } catch {}
      sentinelRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Adquirir quando tocando e ativado; liberar caso contrário
  useEffect(() => {
    if (isPlaying && enabled) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isPlaying, enabled, requestWakeLock, releaseWakeLock]);

  // Re-adquirir no evento visibilitychange se a página voltar a ficar visível
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isPlaying && enabled) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPlaying, enabled, requestWakeLock]);

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("radio_indoor_wakelock_enabled", String(next));
      return next;
    });
  }, []);

  return {
    isSupported,
    isActive,
    enabled,
    toggleEnabled,
  };
}
