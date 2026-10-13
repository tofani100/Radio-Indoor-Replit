import { useEffect, useRef, useState, useCallback } from "react";

const INACTIVITY_TIMEOUT_MS = 15000; // 15 segundos sem uso para iniciar o escurecimento automático

export function useWakeLock(isPlaying: boolean) {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);

  const sentinelRef = useRef<any>(null);
  const inactivityTimerRef = useRef<any>(null);

  useEffect(() => {
    setIsSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  // Adquire o Wake Lock automaticamente para impedir o celular de apagar completamente
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (!isPlaying) return;
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
  }, [isPlaying]);

  const releaseWakeLock = useCallback(() => {
    if (sentinelRef.current) {
      try {
        sentinelRef.current.release();
      } catch {}
      sentinelRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Mantém a tela ligada em segundo plano enquanto toca
  useEffect(() => {
    if (isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
      setIsDimmed(false);
    }
  }, [isPlaying, requestWakeLock, releaseWakeLock]);

  // Re-adquire se a aba voltar a ficar visível
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isPlaying) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPlaying, requestWakeLock]);

  // Gerenciamento de inatividade: após 15s sem toque/interação, escurece suavemente para 20%
  const resetInactivity = useCallback(() => {
    setIsDimmed(false);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (isPlaying) {
      inactivityTimerRef.current = setTimeout(() => {
        setIsDimmed(true);
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      setIsDimmed(false);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    // Inicia o timer inicial
    resetInactivity();

    // Ouvintes de atividade do usuário (toque no celular, clique, movimento)
    const activityEvents = [
      "touchstart",
      "touchmove",
      "touchend",
      "pointerdown",
      "mousedown",
      "keydown",
      "scroll",
    ];

    const onUserActivity = () => {
      resetInactivity();
    };

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, onUserActivity);
      });
    };
  }, [isPlaying, resetInactivity]);

  return {
    isSupported,
    isActive,
    isDimmed,
    resetInactivity,
  };
}
