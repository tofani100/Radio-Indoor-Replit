import { useEffect, useRef, useState, useCallback } from "react";

const INACTIVITY_TIMEOUT_MS = 15000; // 15 segundos sem uso para iniciar o escurecimento automático

/**
 * Detecta se o dispositivo atual é um smartphone/celular móvel.
 * Considera userAgent móvel e suporte a toque com dimensões típicas de celular.
 */
function checkIsMobile(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
  return isMobileUA || (isTouchDevice && isSmallScreen);
}

export function useWakeLock(isPlaying: boolean) {
  const [isMobile, setIsMobile] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);

  const sentinelRef = useRef<any>(null);
  const inactivityTimerRef = useRef<any>(null);

  useEffect(() => {
    setIsMobile(checkIsMobile());
    setIsSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  // Adquire o Wake Lock automaticamente apenas no celular para impedir de apagar completamente
  const requestWakeLock = useCallback(async () => {
    if (!checkIsMobile()) return;
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

  // Mantém a tela ligada em segundo plano enquanto toca (apenas no celular)
  useEffect(() => {
    if (!isMobile) {
      releaseWakeLock();
      setIsDimmed(false);
      return;
    }

    if (isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
      setIsDimmed(false);
    }
  }, [isMobile, isPlaying, requestWakeLock, releaseWakeLock]);

  // Re-adquire se a aba voltar a ficar visível (apenas celular)
  useEffect(() => {
    if (!isMobile) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isPlaying) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMobile, isPlaying, requestWakeLock]);

  // Gerenciamento de inatividade: após 15s sem toque no celular, escurece suavemente para 20%
  const resetInactivity = useCallback(() => {
    setIsDimmed(false);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    // No PC ou se não estiver tocando, nunca inicia o timer de escurecimento
    if (isPlaying && checkIsMobile()) {
      inactivityTimerRef.current = setTimeout(() => {
        setIsDimmed(true);
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isMobile || !isPlaying) {
      setIsDimmed(false);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    // Inicia o timer inicial
    resetInactivity();

    // Ouvintes de atividade do usuário no celular (toque na tela)
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
  }, [isMobile, isPlaying, resetInactivity]);

  return {
    isMobile,
    isSupported,
    isActive,
    isDimmed,
    resetInactivity,
  };
}
