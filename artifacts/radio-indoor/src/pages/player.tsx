import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Radio, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, AlertCircle,
  Clock, Music, Activity, Headphones, Hash, Mic2, SlidersHorizontal,
  Download, Share, CheckCircle2, X, ListMusic, ChevronDown, ArrowLeftRight,
} from "lucide-react";
import {
  useRegisterDevice, useGetPlaybackQueue, getGetPlaybackQueueQueryKey,
  useDeviceHeartbeat, useLogPlayback, useGetPlaybackPlaylists, getGetPlaybackPlaylistsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import logoSrc from "@assets/LOGO_1777766957414.png";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import "@/styles/dj-console.css";

function getOrCreateUUID(): string {
  let uuid = localStorage.getItem("radio_indoor_uuid");
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem("radio_indoor_uuid", uuid);
  }
  return uuid;
}

function getStoredEmail(): string { return localStorage.getItem("radio_indoor_email") ?? ""; }
function setStoredEmail(email: string) { localStorage.setItem("radio_indoor_email", email); }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function clearStoredEmail() { localStorage.removeItem("radio_indoor_email"); }
function clearDeviceIdentity() {
  localStorage.removeItem("radio_indoor_email");
  localStorage.removeItem("radio_indoor_uuid");
}

/** Persist selected playlist ID per device uuid (legacy fallback) */
function getStoredPlaylistId(uuid: string): number | null {
  const v = localStorage.getItem(`radio_indoor_playlist_${uuid}`);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
function setStoredPlaylistId(uuid: string, id: number) {
  localStorage.setItem(`radio_indoor_playlist_${uuid}`, String(id));
}
/** Persist selected playlist ID per logged-in email (primary — follows the user across devices) */
function getStoredPlaylistIdForEmail(email: string): number | null {
  if (!email) return null;
  const v = localStorage.getItem(`radio_indoor_playlist_email_${email}`);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
function setStoredPlaylistIdForEmail(email: string, id: number) {
  if (!email) return;
  localStorage.setItem(`radio_indoor_playlist_email_${email}`, String(id));
}

type PlayerState = "gate" | "pending" | "blocked" | "active";

export default function PlayerPage() {
  const uuid = getOrCreateUUID();
  const [email, setEmail] = useState(getStoredEmail());
  const [inputEmail, setInputEmail] = useState("");
  const [playerState, setPlayerState] = useState<PlayerState>(email ? "pending" : "gate");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(() => {
    const storedEmail = getStoredEmail();
    // Prefer email-keyed preference (survives device changes); fall back to uuid-keyed (legacy)
    return getStoredPlaylistIdForEmail(storedEmail) ?? getStoredPlaylistId(uuid);
  });
  const [playlistDropdownOpen, setPlaylistDropdownOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(() => {
    const v = parseFloat(localStorage.getItem("radio_indoor_volume") ?? "");
    return Number.isFinite(v) ? v : 0.7;
  });
  const [musicMix, setMusicMix] = useState(() => {
    const v = parseFloat(localStorage.getItem("radio_indoor_music_mix") ?? "");
    return Number.isFinite(v) ? v : 1;
  });
  const [jingleMix, setJingleMix] = useState(() => {
    const v = parseFloat(localStorage.getItem("radio_indoor_jingle_mix") ?? "");
    return Number.isFinite(v) ? v : 1;
  });
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [iosHintOpen, setIosHintOpen] = useState(false);
  const pwa = usePwaInstall();
  const qc = useQueryClient();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Time-mode jingle interruption state
  const jingleCycleRef = useRef(0);
  const inJingleRef = useRef(false);
  const resumeMusicIdxRef = useRef<number | null>(null);
  const resumeMusicTimeRef = useRef<number>(0);
  const resumeMusicDurationRef = useRef<number>(0);
  const fadeStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jingleTriggerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentJingle, setCurrentJingle] = useState<{
    id: number; title: string; artist?: string | null; type: string; url: string; coverUrl?: string | null;
  } | null>(null);

  // Quanto tempo de fade-out antes da locução interromper.
  const FADE_OUT_MS = 2000;
  // Se faltar menos que isso pra terminar a música, ao voltar da locução
  // já pula pra próxima faixa em vez de retomar do mesmo ponto.
  const RESUME_THRESHOLD_S = 5;

  const clearTimeModeTimers = () => {
    if (fadeStartTimerRef.current) {
      clearTimeout(fadeStartTimerRef.current);
      fadeStartTimerRef.current = null;
    }
    if (jingleTriggerTimerRef.current) {
      clearTimeout(jingleTriggerTimerRef.current);
      jingleTriggerTimerRef.current = null;
    }
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  };

  // Effective volume for the currently playing track =
  // master * (music or jingle mix), depending on track type.
  const effectiveVolume = (trackType: string | undefined) => {
    const mix = trackType === "jingle" ? jingleMix : musicMix;
    return Math.max(0, Math.min(1, masterVolume * mix));
  };

  const register = useRegisterDevice();

  // React to the latest register response. Using onSuccess in the hook options
  // proved unreliable across re-renders (the callback closure would sometimes
  // not pick up the latest setter), so we watch the mutation's `data` directly.
  useEffect(() => {
    const data = register.data;
    if (!data) return;
    if (data.status === "active") setPlayerState("active");
    else if (data.status === "blocked") setPlayerState("blocked");
    else setPlayerState("pending");
  }, [register.data]);

  const heartbeat = useDeviceHeartbeat({ mutation: {} });
  const logPlayback = useLogPlayback({ mutation: {} });

  const queueParams = { uuid, email, ...(selectedPlaylistId ? { playlistId: selectedPlaylistId } : {}) };
  const { data: queue, refetch: refetchQueue } = useGetPlaybackQueue(
    queueParams,
    {
      query: {
        queryKey: getGetPlaybackQueueQueryKey(queueParams),
        enabled: playerState === "active" && !!email,
        refetchInterval: 30000,
      },
    }
  );

  // Fetch all active playlists for this device's client (only when player is active)
  const playlistsParams = { uuid, email };
  const { data: availablePlaylists } = useGetPlaybackPlaylists(
    playlistsParams,
    {
      query: {
        queryKey: getGetPlaybackPlaylistsQueryKey(playlistsParams),
        enabled: playerState === "active" && !!email,
        refetchInterval: 60000,
      },
    }
  );

  // Sync selected playlist ID from the queue response.
  // If the stored ID was invalid (not in the active playlists), the API fell back
  // to the first active playlist — update local state to reflect that.
  useEffect(() => {
    if (!queue?.playlistId) return;
    if (selectedPlaylistId !== queue.playlistId) {
      setSelectedPlaylistId(queue.playlistId);
      setStoredPlaylistId(uuid, queue.playlistId);
      setStoredPlaylistIdForEmail(email, queue.playlistId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.playlistId]);

  // MUST be before any early return (Rules of Hooks)
  const currentPlaylistName = useMemo(() => {
    if (!availablePlaylists || !selectedPlaylistId) return null;
    return availablePlaylists.find((p) => p.id === selectedPlaylistId)?.name ?? null;
  }, [availablePlaylists, selectedPlaylistId]);

  const multiplePlaylistsAvailable = (availablePlaylists?.length ?? 0) > 1;

  // Build the actual play schedule by interleaving locuções between músicas.
  // - jingleMode "ordered": play items as-is in their saved order
  // - jingleMode "interval": every N músicas insert one locução (cycling)
  // - jingleMode "time": schedule is music-only; jingles are interrupt-driven
  //   by a timer (jingleIntervalSeconds) and fire as overlays via currentJingle.
  // Also applies shuffle when client is set to "shuffle" mode.
  type QueueItem = NonNullable<typeof queue>["items"][number];
  const scheduledItems = useMemo<QueueItem[]>(() => {
    const items = queue?.items ?? [];
    if (items.length === 0) return [];
    const mode = queue?.jingleMode ?? "ordered";
    const interval = Math.max(1, queue?.jingleInterval ?? 3);
    if (mode === "ordered") {
      if (queue?.playbackMode === "shuffle") {
        return [...items].sort(() => Math.random() - 0.5);
      }
      return items;
    }
    if (mode === "time") {
      // Music-only schedule; jingles fire via timer interrupt.
      let musics = items.filter((i) => i.type === "music");
      if (queue?.playbackMode === "shuffle") {
        musics = [...musics].sort(() => Math.random() - 0.5);
      }
      // Fallback: if cliente só tem locuções cadastradas, toca elas mesmo.
      if (musics.length === 0) return items.filter((i) => i.type === "jingle");
      return musics;
    }
    // interval mode: separate musics from jingles, intercalate
    let musics = items.filter((i) => i.type === "music");
    const jingles = items.filter((i) => i.type === "jingle");
    if (queue?.playbackMode === "shuffle") {
      musics = [...musics].sort(() => Math.random() - 0.5);
    }
    if (jingles.length === 0) return musics;
    if (musics.length === 0) return jingles;
    const out: typeof items = [];
    let jIdx = 0;
    musics.forEach((m, i) => {
      out.push(m);
      if ((i + 1) % interval === 0) {
        out.push(jingles[jIdx % jingles.length]!);
        jIdx++;
      }
    });
    return out;
  }, [queue?.items, queue?.jingleMode, queue?.jingleInterval, queue?.playbackMode]);

  // Pool of jingles available for time-mode interruption
  const jinglesPool = useMemo<QueueItem[]>(() => {
    return (queue?.items ?? []).filter((i) => i.type === "jingle");
  }, [queue?.items]);

  // Heartbeat every 3 minutes
  useEffect(() => {
    if (playerState !== "active") return;
    const id = setInterval(() => {
      heartbeat.mutate({ data: { uuid, email } });
    }, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [playerState, email]);

  // Apply volume/mute to the live <audio> element whenever they change.
  useEffect(() => {
    const a = audioRef.current;
    if (a) {
      const trackType = scheduledItems[currentIdx]?.type;
      a.volume = effectiveVolume(trackType);
      a.muted = muted;
    }
    localStorage.setItem("radio_indoor_volume", String(masterVolume));
    localStorage.setItem("radio_indoor_music_mix", String(musicMix));
    localStorage.setItem("radio_indoor_jingle_mix", String(jingleMix));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterVolume, musicMix, jingleMix, muted, currentIdx]);

  const handleStart = () => {
    setStarted(true);
    setIsPlaying(true);
    playTrack(currentIdx);
  };

  // Quando uma locução está interrompendo (modo "time"), exibe ela como item atual.
  const currentItem = currentJingle ?? scheduledItems[currentIdx];

  const playTrack = useCallback((idx: number, resumeAt: number = 0) => {
    const items = scheduledItems;
    if (!items || !items[idx]) return;
    const track = items[idx];
    // Stop any previous audio and clear pending error timer to avoid
    // overlapping skip-chains when several tracks 404 in a row.
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onplaying = null;
      try { audioRef.current.pause(); } catch { /* ignore */ }
      audioRef.current.src = "";
    }
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }
    // Cancela timers do modo "time" antes de armar pra próxima música
    clearTimeModeTimers();

    // Saindo de uma interrupção de locução (modo time): limpa overlay
    setCurrentJingle(null);
    inJingleRef.current = false;
    resumeMusicIdxRef.current = null;

    const audio = new Audio(track.url);
    audio.volume = effectiveVolume(track.type);
    audio.muted = muted;
    audioRef.current = audio;
    setCurrentTime(resumeAt);
    setDuration(0);
    if (resumeAt > 0) {
      const trySeek = () => {
        try { audio.currentTime = resumeAt; } catch { /* ignore */ }
      };
      audio.addEventListener("loadedmetadata", trySeek, { once: true });
    }
    audio.play().catch((err) => {
      console.error("Falha ao tocar áudio:", track.url, err);
    });
    audio.onplaying = () => {
      consecutiveErrorsRef.current = 0;
      setLoadError(null);
    };
    audio.onloadedmetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };
    audio.onended = () => {
      logPlayback.mutate({ data: { mediaId: track.id, uuid, email } });
      const next = (idx + 1) % items.length;
      setCurrentIdx(next);
      playTrack(next);
    };
    audio.onerror = () => {
      console.error("Erro carregando áudio:", track.url);
      consecutiveErrorsRef.current += 1;
      // If we have looped through every item without a single successful
      // play, stop trying. Otherwise the player races through 404s forever.
      if (consecutiveErrorsRef.current >= items.length) {
        setIsPlaying(false);
        setLoadError(
          "Nenhum dos arquivos da playlist pode ser carregado. " +
          "As mídias podem ter sido removidas do servidor — peça ao administrador para reenviá-las.",
        );
        return;
      }
      skipTimerRef.current = setTimeout(() => {
        skipTimerRef.current = null;
        const next = (idx + 1) % items.length;
        setCurrentIdx(next);
        playTrack(next);
      }, 1500);
    };
    setCurrentIdx(idx);
    setIsPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledItems, uuid, email]);

  // Modo "time": interrompe a música atual pra tocar 1 locução. Ao terminar
  // a locução, RETOMA a mesma música do ponto onde parou — só avança pra
  // próxima se a música já estava quase no fim.
  const playJingleInterrupt = useCallback(() => {
    if (inJingleRef.current) return;
    if (jinglesPool.length === 0) return;
    if (!scheduledItems.length) return;
    const jingle = jinglesPool[jingleCycleRef.current % jinglesPool.length]!;
    jingleCycleRef.current += 1;

    // Captura posição atual da música pra retomar depois
    const prevAudio = audioRef.current;
    const prevTime = prevAudio?.currentTime ?? 0;
    const prevDuration = (prevAudio && Number.isFinite(prevAudio.duration)) ? prevAudio.duration : 0;
    resumeMusicIdxRef.current = currentIdx;
    resumeMusicTimeRef.current = prevTime;
    resumeMusicDurationRef.current = prevDuration;

    if (prevAudio) {
      prevAudio.onended = null;
      prevAudio.onerror = null;
      prevAudio.onplaying = null;
      try { prevAudio.pause(); } catch { /* ignore */ }
      prevAudio.src = "";
    }
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }
    clearTimeModeTimers();

    inJingleRef.current = true;
    setCurrentJingle({
      id: jingle.id,
      title: jingle.title,
      artist: jingle.artist ?? null,
      type: jingle.type,
      url: jingle.url,
      coverUrl: jingle.coverUrl ?? null,
    });

    const audio = new Audio(jingle.url);
    audio.volume = effectiveVolume("jingle");
    audio.muted = muted;
    audioRef.current = audio;
    setCurrentTime(0);
    setDuration(0);
    audio.play().catch((err) => {
      console.error("Falha ao tocar locução:", jingle.url, err);
    });
    audio.onloadedmetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const resumeOrAdvance = () => {
      // Garante que o estado de "em locução" seja limpo mesmo se algo abaixo
      // der curto-circuito (queue vazia, idx inválido, etc).
      setCurrentJingle(null);
      inJingleRef.current = false;
      const items = scheduledItems;
      if (!items || items.length === 0) {
        // Queue ficou vazia durante a locução — para o player.
        if (audioRef.current) {
          try { audioRef.current.pause(); } catch { /* ignore */ }
        }
        setIsPlaying(false);
        return;
      }
      const safeIdx = ((resumeMusicIdxRef.current ?? currentIdx) % items.length + items.length) % items.length;
      const resumeTime = resumeMusicTimeRef.current ?? 0;
      const resumeDuration = resumeMusicDurationRef.current ?? 0;
      const sameTrackStillExists = items[safeIdx] != null;
      const remaining = resumeDuration > 0 ? resumeDuration - resumeTime : Infinity;
      if (sameTrackStillExists && resumeDuration > 0 && remaining < RESUME_THRESHOLD_S) {
        // Quase no fim: pula pra próxima música.
        const next = (safeIdx + 1) % items.length;
        setCurrentIdx(next);
        playTrack(next, 0);
      } else if (sameTrackStillExists) {
        // Retoma a MESMA música do ponto onde a locução interrompeu.
        playTrack(safeIdx, resumeTime);
      } else {
        // Track sumiu da queue — toca o item no índice ajustado do zero.
        playTrack(safeIdx, 0);
      }
    };
    audio.onended = () => {
      logPlayback.mutate({ data: { mediaId: jingle.id, uuid, email } });
      resumeOrAdvance();
    };
    audio.onerror = () => {
      console.error("Erro carregando locução:", jingle.url);
      resumeOrAdvance();
    };
    setIsPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jinglesPool, scheduledItems, currentIdx, muted, uuid, email, playTrack]);

  // Faz fade-out gradual do volume da música atual ao longo de FADE_OUT_MS.
  const startFadeOut = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const startVol = a.volume;
    if (startVol <= 0) return;
    const steps = 20;
    const stepMs = FADE_OUT_MS / steps;
    let i = 0;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    const target = a; // congela a referência: se mudar, abortamos
    fadeIntervalRef.current = setInterval(() => {
      i++;
      if (audioRef.current !== target) {
        if (fadeIntervalRef.current) { clearInterval(fadeIntervalRef.current); fadeIntervalRef.current = null; }
        return;
      }
      target.volume = Math.max(0, startVol * (1 - i / steps));
      if (i >= steps) {
        if (fadeIntervalRef.current) { clearInterval(fadeIntervalRef.current); fadeIntervalRef.current = null; }
      }
    }, stepMs);
  }, []);

  // Arma os timers do modo "time": fade-out 2s antes + disparo da locução.
  // Roda toda vez que: muda música tocando, queue muda, pause/resume, etc.
  useEffect(() => {
    clearTimeModeTimers();
    if (queue?.jingleMode !== "time") return;
    if (playerState !== "active") return;
    if (!started || !isPlaying) return;
    if (inJingleRef.current) return; // locução já tocando, não rearma agora
    if (jinglesPool.length === 0) return;
    if (!scheduledItems.length) return;
    const seconds = Math.max(2, queue?.jingleIntervalSeconds ?? 900);
    const fadeAtMs = Math.max(0, (seconds * 1000) - FADE_OUT_MS);
    fadeStartTimerRef.current = setTimeout(() => {
      startFadeOut();
    }, fadeAtMs);
    jingleTriggerTimerRef.current = setTimeout(() => {
      playJingleInterrupt();
    }, seconds * 1000);
    return () => clearTimeModeTimers();
  }, [
    queue?.jingleMode,
    queue?.jingleIntervalSeconds,
    playerState,
    started,
    isPlaying,
    jinglesPool.length,
    scheduledItems.length,
    currentIdx,
    currentJingle,
    playJingleInterrupt,
    startFadeOut,
  ]);

  const handleSeek = (value: number) => {
    const a = audioRef.current;
    if (a && Number.isFinite(a.duration) && a.duration > 0) {
      a.currentTime = Math.max(0, Math.min(a.duration, value));
      setCurrentTime(a.currentTime);
    }
  };

  const fmtTime = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = () => {
    if (!started) { handleStart(); return; }
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const handlePrev = () => {
    if (!scheduledItems.length) return;
    consecutiveErrorsRef.current = 0;
    setLoadError(null);
    const prev = (currentIdx - 1 + scheduledItems.length) % scheduledItems.length;
    playTrack(prev);
  };

  const handleNext = () => {
    if (!scheduledItems.length) return;
    consecutiveErrorsRef.current = 0;
    setLoadError(null);
    const next = (currentIdx + 1) % scheduledItems.length;
    playTrack(next);
  };

  // Lista completa da fila (relação completa):
  // Começa na faixa atual (posição 0) e percorre toda a playlist,
  // fazendo a rotação para o final conforme vai tocando.
  const upcoming = useMemo(() => {
    const list = scheduledItems;
    if (list.length === 0) return [] as Array<{ item: typeof list[number]; absoluteIdx: number }>;
    const out: Array<{ item: typeof list[number]; absoluteIdx: number }> = [];
    const total = list.length;
    for (let k = 0; k < total; k++) {
      const idx = (currentIdx + k) % total;
      out.push({ item: list[idx]!, absoluteIdx: idx });
    }
    return out;
  }, [scheduledItems, currentIdx]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputEmail.trim();
    if (!trimmed) return;
    setEmail(trimmed);
    setStoredEmail(trimmed);
    setPlayerState("pending");
    register.mutate({ data: { uuid, email: trimmed } });
  };

  // Initial registration on mount when we already have a stored email.
  // Without this, the user would stare at "Aguardando aprovação" for up to
  // 10s before the first poll fires (or forever if they reload at the wrong
  // moment). Runs exactly once per page load.
  const didInitialRegisterRef = useRef(false);
  useEffect(() => {
    if (didInitialRegisterRef.current) return;
    if (!email) return;
    didInitialRegisterRef.current = true;
    register.mutate({ data: { uuid, email } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check status periodically if pending (every 3s for snappier approval flow)
  useEffect(() => {
    if (playerState !== "pending") return;
    const id = setInterval(() => {
      register.mutate({ data: { uuid, email } });
    }, 3000);
    return () => clearInterval(id);
  }, [playerState, uuid, email]);

  if (playerState === "gate") {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-sidebar-primary flex items-center justify-center mx-auto mb-6">
            <Radio className="w-8 h-8 text-sidebar-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-sidebar-foreground mb-2">Radio Indoor</h1>
          <p className="text-sm text-sidebar-foreground/50 mb-8">Digite o email autorizado desta filial para acessar o player</p>
          <form onSubmit={handleEmailSubmit} className="space-y-3" autoComplete="off">
            <input
              data-testid="input-email"
              type="email"
              name="player_device_email"
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              placeholder="email.da.filial@empresa.com"
              required
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              className="w-full px-4 py-3 rounded-xl bg-sidebar-accent border border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/30 text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary"
            />
            {inputEmail.trim() && (
              <p className="text-xs text-sidebar-foreground/60 px-1 text-left">
                Vai registrar como: <span className="font-mono text-sidebar-primary">{inputEmail.trim()}</span>
              </p>
            )}
            <button
              data-testid="button-submit"
              type="submit"
              disabled={register.isPending}
              className="w-full py-3 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {register.isPending ? "Verificando..." : "Acessar"}
            </button>
          </form>
          <p className="mt-6 text-xs text-sidebar-foreground/20 font-mono">{uuid.substring(0, 16)}...</p>
        </div>
      </div>
    );
  }

  if (playerState === "pending") {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold text-sidebar-foreground mb-2">Aguardando Aprovacao</h1>
          <p className="text-sm text-sidebar-foreground/50 mb-3">Seu acesso esta sendo analisado pelo administrador.</p>
          <div className="bg-sidebar-accent/40 border border-sidebar-border rounded-xl px-4 py-3 mb-3">
            <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 mb-1">Conectado como</p>
            <p className="text-sm font-mono text-sidebar-foreground break-all">{email}</p>
          </div>
          <button
            data-testid="button-pending-switch"
            type="button"
            onClick={() => {
              if (confirm(`O email "${email}" esta correto? Se NAO for voce, clique OK para limpar e digitar o email correto. Um novo dispositivo sera criado.`)) {
                clearDeviceIdentity();
                window.location.reload();
              }
            }}
            className="text-xs text-sidebar-primary underline underline-offset-4 hover:opacity-80"
          >
            Nao sou eu — trocar email
          </button>
          <div className="flex gap-1 justify-center mt-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (playerState === "blocked") {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-destructive/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-sidebar-foreground mb-2">Acesso Bloqueado</h1>
          <p className="text-sm text-sidebar-foreground/50 mb-3">Este dispositivo foi bloqueado. Entre em contato com o administrador.</p>
          <div className="bg-sidebar-accent/40 border border-sidebar-border rounded-xl px-4 py-3 mb-3">
            <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 mb-1">Conectado como</p>
            <p className="text-sm font-mono text-sidebar-foreground break-all">{email}</p>
          </div>
          <button
            data-testid="button-blocked-switch"
            type="button"
            onClick={() => {
              if (confirm(`Limpar este dispositivo e digitar outro email? Um novo dispositivo sera criado.`)) {
                clearDeviceIdentity();
                window.location.reload();
              }
            }}
            className="text-xs text-sidebar-primary underline underline-offset-4 hover:opacity-80"
          >
            Trocar email
          </button>
        </div>
      </div>
    );
  }

  const items = scheduledItems;
  const displayVolume = muted ? 0 : masterVolume;

  // Distance until the next locução in the upcoming window (excluding current).
  const tracksUntilJingle = (() => {
    for (let k = 1; k < upcoming.length; k++) {
      if (upcoming[k]!.item.type === "jingle") return k;
    }
    return null;
  })();

  const fmtMMSS = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const getDbLevel = (val: number) => {
    if (val === 0) return "-∞ dB";
    const db = 20 * Math.log10(val);
    return db > 0 ? `+${db.toFixed(1)} dB` : `${db.toFixed(1)} dB`;
  };

  const jumpTo = (idx: number) => {
    consecutiveErrorsRef.current = 0;
    setLoadError(null);
    if (!started) setStarted(true);
    playTrack(idx);
  };

  /** Switch to a different playlist: stop audio, reset state, refetch queue */
  const handlePlaylistSwitch = (playlistId: number) => {
    setPlaylistDropdownOpen(false);
    if (playlistId === selectedPlaylistId) return;

    // Stop current audio cleanly
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onplaying = null;
      try { audioRef.current.pause(); } catch { /* ignore */ }
      audioRef.current.src = "";
    }
    clearTimeModeTimers();
    setCurrentJingle(null);
    inJingleRef.current = false;
    resumeMusicIdxRef.current = null;
    setCurrentIdx(0);
    setIsPlaying(false);
    setStarted(false);
    setLoadError(null);
    consecutiveErrorsRef.current = 0;

    setSelectedPlaylistId(playlistId);
    setStoredPlaylistId(uuid, playlistId);
    setStoredPlaylistIdForEmail(email, playlistId);

    // Refetch will pick up the new playlistId via queueParams
    setTimeout(() => { void refetchQueue(); }, 50);
  };

  return (
    <div className="dj-console-scope min-h-screen lg:h-screen w-full flex flex-col p-2 sm:p-3 lg:p-4 gap-2 sm:gap-3 lg:gap-4 box-border overflow-y-auto lg:overflow-hidden select-none">
      {/* Top Header */}
      <header className="flex-none h-10 sm:h-14 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg flex items-center justify-between px-3 sm:px-6 shadow-lg">
        <div className="flex items-center gap-3 sm:gap-4">
          <img src={logoSrc} alt="Play-Comunique" className="h-7 object-contain" />
          <div className="hidden sm:block w-px h-6 bg-[var(--dj-border)]" />
          <span className="hidden sm:flex text-[var(--dj-cyan)] font-bold tracking-widest text-sm uppercase items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Operator Console
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Playlist switcher — exibido para permitir a troca entre todas as playlists do cliente */}
          {(availablePlaylists?.length ?? 0) > 0 && (
            <div className="relative">
              <button
                data-testid="button-playlist-switcher"
                type="button"
                onClick={() => setPlaylistDropdownOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--dj-cyan)] bg-[var(--dj-cyan-glow)] text-[var(--dj-cyan)] text-[10px] uppercase font-bold tracking-widest hover:bg-[var(--dj-cyan)] hover:text-[#060a14] transition-colors cursor-pointer"
                title="Trocar de playlist"
              >
                <ListMusic className="w-3.5 h-3.5 flex-none" />
                <span className="hidden sm:inline truncate max-w-[140px]">
                  {currentPlaylistName ?? "Playlist"}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 flex-none transition-transform ${playlistDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {playlistDropdownOpen && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setPlaylistDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 z-50 min-w-[200px] bg-[var(--dj-panel)] border border-[var(--dj-cyan)] rounded-lg shadow-2xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-[var(--dj-border)]">
                      <p className="text-[9px] uppercase tracking-widest text-[var(--dj-muted)]">Selecionar Playlist</p>
                    </div>
                    {availablePlaylists!.map((pl) => (
                      <button
                        key={pl.id}
                        type="button"
                        data-testid={`playlist-option-${pl.id}`}
                        onClick={() => handlePlaylistSwitch(pl.id)}
                        className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between gap-3 transition-colors ${
                          pl.id === selectedPlaylistId
                            ? "bg-[var(--dj-cyan-glow)] text-[var(--dj-cyan)]"
                            : "text-[var(--dj-text)] hover:bg-[var(--dj-accent)]"
                        }`}
                      >
                        <span className="font-semibold truncate">{pl.name}</span>
                        <span className="text-[var(--dj-muted)] flex-none">{pl.itemCount} faixas</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="hidden md:flex items-center gap-2 text-xs font-semibold">
            <Radio className="w-4 h-4 text-[var(--dj-cyan)]" />
            <span className="text-[var(--dj-muted)] uppercase">Conta</span>
            <span className="dj-mono text-[var(--dj-text)] bg-[var(--dj-bg)] px-2 py-1 rounded border border-[var(--dj-border)] truncate max-w-[200px]">
              {email}
            </span>
            <button
              data-testid="button-switch-account"
              type="button"
              onClick={() => {
                if (confirm(`Trocar de conta? O dispositivo atual (${email}) sera desconectado deste navegador e um NOVO dispositivo sera criado quando voce digitar outro email. Continuar?`)) {
                  clearDeviceIdentity();
                  window.location.reload();
                }
              }}
              className="text-[10px] uppercase tracking-widest font-bold text-[var(--dj-magenta)] hover:text-[var(--dj-cyan)] transition-colors px-2 py-1 rounded border border-[var(--dj-border)] hover:border-[var(--dj-cyan)]"
              title="Trocar o email registrado neste dispositivo"
            >
              Trocar
            </button>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs font-semibold">
            <Headphones className="w-4 h-4 text-[var(--dj-magenta)]" />
            <span className="text-[var(--dj-muted)] uppercase">Faixas</span>
            <span className="dj-mono text-[var(--dj-text)] bg-[var(--dj-bg)] px-2 py-1 rounded border border-[var(--dj-border)]">
              {items.length}
            </span>
          </div>
          {/* ── MOBILE: ícone instalar app ── */}
          {pwa.installed ? (
            <div
              className="sm:hidden w-7 h-7 rounded border border-[var(--dj-cyan)] bg-[var(--dj-cyan-glow)] text-[var(--dj-cyan)] flex items-center justify-center"
              title="Aplicativo instalado"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          ) : pwa.canInstall ? (
            <button
              data-testid="button-install-pwa"
              onClick={() => { void pwa.promptInstall(); }}
              className="sm:hidden w-7 h-7 rounded border border-[var(--dj-cyan)] bg-[var(--dj-cyan-glow)] text-[var(--dj-cyan)] flex items-center justify-center hover:bg-[var(--dj-cyan)] hover:text-[#060a14] transition-colors"
              title="Instalar como aplicativo"
              aria-label="Instalar como aplicativo"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          ) : pwa.isIos ? (
            <button
              data-testid="button-install-ios-hint"
              onClick={() => setIosHintOpen(true)}
              className="sm:hidden w-7 h-7 rounded border border-[var(--dj-cyan)] bg-[var(--dj-cyan-glow)] text-[var(--dj-cyan)] flex items-center justify-center hover:bg-[var(--dj-cyan)] hover:text-[#060a14] transition-colors"
              title="Como instalar no iPhone/iPad"
              aria-label="Como instalar no iPhone ou iPad"
            >
              <Share className="w-3.5 h-3.5" />
            </button>
          ) : null}

          {/* ── MOBILE: ícone trocar conta ── */}
          <button
            data-testid="button-switch-account-mobile"
            type="button"
            onClick={() => {
              if (confirm(`Trocar de conta? O dispositivo atual (${email}) sera desconectado deste navegador e um NOVO dispositivo sera criado quando voce digitar outro email. Continuar?`)) {
                clearDeviceIdentity();
                window.location.reload();
              }
            }}
            className="sm:hidden w-7 h-7 rounded border border-[var(--dj-border)] bg-[var(--dj-bg)] text-[var(--dj-muted)] flex items-center justify-center hover:border-[var(--dj-magenta)] hover:text-[var(--dj-magenta)] transition-colors"
            title={`Trocar conta (${email})`}
            aria-label="Trocar conta"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          {/* ── DESKTOP: instalar app (com texto) ── */}
          {pwa.installed ? (
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded uppercase text-[10px] font-bold tracking-widest border bg-[var(--dj-cyan-glow)] border-[var(--dj-cyan)] text-[var(--dj-cyan)]"
              title="Aplicativo instalado neste dispositivo"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Instalado
            </div>
          ) : pwa.canInstall ? (
            <button
              data-testid="button-install-pwa"
              onClick={() => { void pwa.promptInstall(); }}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded uppercase text-[10px] font-bold tracking-widest border bg-[var(--dj-cyan-glow)] border-[var(--dj-cyan)] text-[var(--dj-cyan)] hover:bg-[var(--dj-cyan)] hover:text-[#060a14] transition-colors"
              title="Instalar como aplicativo"
              aria-label="Instalar como aplicativo"
            >
              <Download className="w-3.5 h-3.5" /> Instalar app
            </button>
          ) : pwa.isIos ? (
            <button
              data-testid="button-install-ios-hint"
              onClick={() => setIosHintOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded uppercase text-[10px] font-bold tracking-widest border bg-[var(--dj-cyan-glow)] border-[var(--dj-cyan)] text-[var(--dj-cyan)] hover:bg-[var(--dj-cyan)] hover:text-[#060a14] transition-colors"
              title="Como instalar no iPhone/iPad"
              aria-label="Como instalar no iPhone ou iPad"
            >
              <Share className="w-3.5 h-3.5" /> Instalar no iOS
            </button>
          ) : null}

          {/* Status badge — hidden on mobile to save space */}
          <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded uppercase text-xs font-bold tracking-widest border ${
            isPlaying
              ? "bg-[var(--dj-magenta-glow)] border-[var(--dj-magenta)] text-[var(--dj-magenta)]"
              : "bg-[var(--dj-accent)]/30 border-[var(--dj-border)] text-[var(--dj-muted)]"
          }`}>
            <div className={`w-2 h-2 rounded-full flex-none ${isPlaying ? "bg-[var(--dj-magenta)] dj-animate-live" : "bg-[var(--dj-muted)]"}`} />
            <span>{isPlaying ? "Ao Vivo" : "Pausado"}</span>
          </div>
          {/* Mobile: just the live dot */}
          <div className={`sm:hidden w-2 h-2 rounded-full ${isPlaying ? "bg-[var(--dj-magenta)] dj-animate-live" : "bg-[var(--dj-muted)]"}`} />
        </div>
      </header>

      {iosHintOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setIosHintOpen(false)}
        >
          <div
            className="bg-[var(--dj-panel)] border border-[var(--dj-cyan)] rounded-lg shadow-2xl max-w-sm w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIosHintOpen(false)}
              className="absolute top-3 right-3 text-[var(--dj-muted)] hover:text-[var(--dj-text)]"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-4 text-[var(--dj-cyan)]">
              <Share className="w-5 h-5" />
              <h3 className="font-bold uppercase tracking-wider text-sm">Instalar no iPhone/iPad</h3>
            </div>
            <ol className="text-sm text-[var(--dj-text)] space-y-3 list-decimal pl-5">
              <li>Toque no ícone <strong>Compartilhar</strong> na barra do Safari (quadrado com seta pra cima).</li>
              <li>Role até <strong>"Adicionar à Tela de Início"</strong>.</li>
              <li>Toque em <strong>Adicionar</strong>. O Rádio Indoor vai aparecer como um app no seu iPad/iPhone.</li>
            </ol>
            <p className="text-xs text-[var(--dj-muted)] mt-4">
              No iOS, a instalação só funciona pelo Safari (não funciona no Chrome iOS).
            </p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="flex-none flex items-center gap-2 text-xs px-4 py-2 rounded-lg bg-[var(--dj-magenta-glow)] border border-[var(--dj-magenta)] text-[var(--dj-magenta)]">
          <AlertCircle className="w-4 h-4 flex-none" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-2 sm:gap-3 lg:gap-4 lg:flex-1 lg:min-h-0">

        {/* Left: Now Playing + Waveform + Transport */}
        <div className="lg:w-1/3 flex flex-col gap-2 sm:gap-3 lg:gap-4 lg:min-h-0">

          {/* ── MOBILE: compact horizontal now-playing strip ── */}
          <div className="lg:hidden bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg shadow-md relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-[var(--dj-cyan)] to-[var(--dj-magenta)] opacity-60" />
            <div className="flex items-center gap-3 px-3 pt-3 pb-2">
              {/* Small album art */}
              <div className="w-12 h-12 rounded-lg bg-[#0a0f1a] border border-[var(--dj-border)] flex items-center justify-center flex-none overflow-hidden shadow-[0_0_12px_rgba(0,240,255,0.1)]">
                {currentItem?.coverUrl ? (
                  <img src={currentItem.coverUrl} alt={currentItem.title} className={`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? "scale-110" : "scale-100"}`} />
                ) : (
                  <img src={logoSrc} alt="Play-Comunique" className="w-8 h-8 object-contain opacity-70" />
                )}
              </div>
              {/* Track info */}
              <div className="flex-1 min-w-0">
                {currentItem ? (
                  <>
                    <div className={`text-[9px] uppercase font-bold tracking-wider flex items-center gap-1 mb-0.5 ${
                      currentItem.type === "music" ? "text-[var(--dj-cyan)]" : "text-[var(--dj-magenta)]"
                    }`}>
                      {currentItem.type === "music" ? <Music className="w-2.5 h-2.5" /> : <Mic2 className="w-2.5 h-2.5" />}
                      {currentItem.type === "music" ? "Música" : "Locução"}
                    </div>
                    <p className="text-sm font-semibold text-[var(--dj-text)] truncate leading-tight">{currentItem.title}</p>
                    <p className="text-[11px] text-[var(--dj-muted)] truncate">{currentItem.artist ?? "—"}</p>
                  </>
                ) : (
                  <p className="text-xs text-[var(--dj-muted)]">{items.length ? "Pressione play" : "Sem faixas"}</p>
                )}
              </div>
              {/* Time */}
              <span className="text-[11px] dj-mono text-[var(--dj-muted)] flex-none">{fmtMMSS(currentTime)}</span>
            </div>
            {/* Progress bar */}
            <div className="px-3 pb-2">
              <input data-testid="slider-progress" type="range" min={0} max={duration || 1} step={0.01} value={currentTime} disabled={!duration} onChange={(e) => handleSeek(parseFloat(e.target.value))} aria-label="Posição da faixa" className="dj-progress" />
            </div>
          </div>

          {/* ── DESKTOP: full centered now-playing card ── */}
          <div className="hidden lg:flex flex-1 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg flex-col p-6 shadow-lg relative overflow-hidden min-h-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--dj-cyan)] to-[var(--dj-magenta)] opacity-50" />
            <h2 className="text-xs uppercase font-bold text-[var(--dj-muted)] tracking-widest mb-4 flex justify-between flex-none">
              <span>Status de Reprodução</span>
              <span className="dj-mono text-[var(--dj-cyan)]">{fmtMMSS(currentTime)} / {fmtMMSS(duration)}</span>
            </h2>
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2 min-h-0">
              <div className="w-44 h-44 rounded-full bg-[#0a0f1a] border-4 border-[var(--dj-border)] shadow-[0_0_40px_rgba(0,240,255,0.1)] flex items-center justify-center mb-5 relative overflow-hidden flex-none">
                {currentItem?.coverUrl ? (
                  <img src={currentItem.coverUrl} alt={currentItem.title} className={`w-full h-full object-cover transition-transform duration-1000 ${isPlaying ? "scale-110" : "scale-100"}`} />
                ) : (
                  <img src={logoSrc} alt="Play-Comunique" className={`w-24 h-24 object-contain transition-transform duration-1000 ${isPlaying ? "scale-110" : "scale-100"}`} />
                )}
                {isPlaying && <div className="absolute inset-0 border-4 border-[var(--dj-cyan)] rounded-full opacity-20 dj-animate-live pointer-events-none" />}
              </div>
              {currentItem ? (
                <div className="w-full">
                  <div className={`text-[10px] uppercase font-bold px-3 py-1 rounded inline-flex items-center gap-1.5 mb-3 border ${
                    currentItem.type === "music" ? "bg-[var(--dj-cyan-glow)] text-[var(--dj-cyan)] border-[var(--dj-cyan)]" : "bg-[var(--dj-magenta-glow)] text-[var(--dj-magenta)] border-[var(--dj-magenta)]"
                  }`}>
                    {currentItem.type === "music" ? <Music className="w-3 h-3" /> : <Mic2 className="w-3 h-3" />}
                    {currentItem.type === "music" ? "Música" : "Locução"}
                  </div>
                  <h1 className="text-2xl font-bold text-[var(--dj-text)] truncate w-full mb-1 tracking-tight">{currentItem.title}</h1>
                  <p className="text-[var(--dj-muted)] text-base truncate w-full">{currentItem.artist ?? "Desconhecido"}</p>
                </div>
              ) : (
                <p className="text-[var(--dj-muted)] text-sm">{items.length ? "Pressione Play para começar" : "Sem faixas na playlist"}</p>
              )}
            </div>
            <div className="mt-4 flex-none">
              <input data-testid="slider-progress" type="range" min={0} max={duration || 1} step={0.01} value={currentTime} disabled={!duration} onChange={(e) => handleSeek(parseFloat(e.target.value))} aria-label="Posição da faixa" className="dj-progress" />
            </div>
            <div className="h-12 mt-3 flex items-end gap-[2px] w-full opacity-80 flex-none">
              {Array.from({ length: 40 }).map((_, i) => {
                const ratio = duration > 0 ? currentTime / duration : 0;
                const isActive = i / 40 < ratio;
                const height = 20 + Math.sin(i * 0.5) * 15 + (i * 7 % 17);
                const activeColor = currentItem?.type === "jingle" ? "bg-[var(--dj-magenta)] shadow-[0_0_8px_var(--dj-magenta)]" : "bg-[var(--dj-cyan)] shadow-[0_0_8px_var(--dj-cyan)]";
                return <div key={i} className={`flex-1 rounded-t-sm transition-colors duration-200 ${isActive ? activeColor : "bg-[var(--dj-accent)]"} ${isPlaying && isActive ? `dj-vu-bar dj-vu-${(i % 12) + 1}` : ""}`} style={{ height: `${height}%` }} />;
              })}
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex-none h-14 sm:h-16 lg:h-24 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg flex items-center justify-center gap-4 sm:gap-5 lg:gap-6 shadow-lg">
            <button
              data-testid="button-prev"
              onClick={handlePrev}
              disabled={!items.length}
              aria-label="Faixa anterior"
              title="Faixa anterior"
              className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center hover:bg-[var(--dj-panel-hover)] transition-colors text-[var(--dj-text)] disabled:opacity-30"
            >
              <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </button>
            <button
              data-testid="button-play-pause"
              onClick={handlePlayPause}
              disabled={!items.length}
              aria-label={isPlaying ? "Pausar" : "Tocar"}
              aria-pressed={isPlaying}
              title={isPlaying ? "Pausar" : "Tocar"}
              className={`w-11 h-11 sm:w-13 sm:h-13 lg:w-16 lg:h-16 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 ${
                isPlaying ? "bg-[var(--dj-cyan)] text-[#060a14] shadow-[0_0_15px_var(--dj-cyan-glow)]" : "bg-[var(--dj-accent)] text-[var(--dj-text)]"
              }`}
            >
              {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 ml-0.5" />}
            </button>
            <button
              data-testid="button-next"
              onClick={handleNext}
              disabled={!items.length}
              aria-label="Próxima faixa"
              title="Próxima faixa"
              className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center hover:bg-[var(--dj-panel-hover)] transition-colors text-[var(--dj-text)] disabled:opacity-30"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </button>
          </div>
        </div>

        {/* Center: Queue */}
        <div className="lg:w-1/3 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg shadow-lg flex flex-col overflow-hidden lg:min-h-0 max-h-64 sm:max-h-80 lg:max-h-none">
          <div className="px-3 py-2 lg:px-5 lg:py-4 border-b border-[var(--dj-border)] flex items-center justify-between bg-[var(--dj-bg)]/50 flex-none">
            <h2 className="text-[10px] lg:text-xs uppercase font-bold text-[var(--dj-muted)] tracking-widest flex items-center gap-1.5">
              <Hash className="w-3 h-3 lg:w-4 lg:h-4" /> Fila ({scheduledItems.length} {scheduledItems.length === 1 ? "faixa" : "faixas"})
            </h2>
            {tracksUntilJingle !== null && (
              <div className="flex items-center gap-1.5 bg-[var(--dj-magenta-glow)] border border-[var(--dj-magenta)] text-[var(--dj-magenta)] px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                <AlertCircle className="w-2.5 h-2.5" />
                T-{tracksUntilJingle} locução
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {upcoming.length === 0 ? (
              <div className="p-4 text-xs text-[var(--dj-muted)] text-center">Fila vazia</div>
            ) : (
              <div className="p-1.5 space-y-0.5">
                {upcoming.map(({ item, absoluteIdx }, displayPos) => {
                  const isCurrent = displayPos === 0;
                  const isJingle = item.type === "jingle";
                  return (
                    <div
                      key={`${absoluteIdx}-${item.id}`}
                      data-testid={`queue-item-${item.id}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Tocar ${item.title}${item.artist ? ` de ${item.artist}` : ""}`}
                      aria-current={isCurrent ? "true" : undefined}
                      onClick={() => jumpTo(absoluteIdx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          jumpTo(absoluteIdx);
                        }
                      }}
                      className={`flex items-center gap-2 px-2 py-1.5 lg:p-3 rounded cursor-pointer transition-colors group border focus:outline-none focus:ring-1 focus:ring-[var(--dj-cyan)] ${
                        isCurrent
                          ? (isJingle ? "bg-[var(--dj-magenta-glow)] border-[var(--dj-magenta)]" : "bg-[var(--dj-cyan-glow)] border-[var(--dj-cyan)]")
                          : "bg-transparent border-transparent hover:bg-[var(--dj-panel-hover)]"
                      }`}
                    >
                      <div className="w-5 text-center text-[10px] dj-mono text-[var(--dj-muted)] flex-none">
                        {isCurrent
                          ? (isPlaying ? <Activity className={`w-3 h-3 mx-auto ${isJingle ? "text-[var(--dj-magenta)]" : "text-[var(--dj-cyan)]"}`} /> : "⏸")
                          : displayPos}
                      </div>
                      <div className="w-1 h-6 rounded-full flex-none bg-[var(--dj-accent)] overflow-hidden">
                        <div className={`w-full h-full ${isJingle ? "bg-[var(--dj-magenta)]" : "bg-[var(--dj-cyan)]"} ${isCurrent ? "opacity-100" : "opacity-30 group-hover:opacity-60"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold truncate ${
                          isCurrent ? (isJingle ? "text-[var(--dj-magenta)]" : "text-[var(--dj-cyan)]") : "text-[var(--dj-text)]"
                        }`}>
                          {item.title}
                        </p>
                        <p className="text-[10px] text-[var(--dj-muted)] truncate">{item.artist ?? "—"}</p>
                      </div>
                      <div className="text-[10px] dj-mono text-[var(--dj-muted)] flex-none">
                        {isCurrent && duration > 0
                          ? `-${fmtMMSS(Math.max(0, duration - currentTime))}`
                          : item.duration ? fmtMMSS(item.duration) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Mixer */}
        <div className="lg:w-1/3 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg shadow-lg flex flex-col overflow-hidden relative lg:min-h-0">
          <div className="px-3 py-2 lg:px-5 lg:py-4 border-b border-[var(--dj-border)] flex justify-between items-center bg-[var(--dj-bg)]/50 flex-none">
            <h2 className="text-[10px] lg:text-xs uppercase font-bold text-[var(--dj-muted)] tracking-widest flex items-center gap-1.5">
              <SlidersHorizontal className="w-3 h-3 lg:w-4 lg:h-4" /> Volume
            </h2>
            <button
              data-testid="button-mute"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Ativar som" : "Mutar"}
              aria-pressed={muted}
              className={`p-1.5 rounded transition-colors ${muted ? "bg-[var(--dj-magenta)] text-white" : "bg-[var(--dj-bg)] text-[var(--dj-muted)] border border-[var(--dj-border)]"}`}
              title={muted ? "Ativar som" : "Mutar"}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* ── MOBILE: compact horizontal sliders ── */}
          <div className="lg:hidden px-3 py-3 space-y-2.5">
            {[
              { label: "Música", icon: <Music className="w-3 h-3" />, color: "var(--dj-cyan)", value: musicMix, testId: "slider-music-mix", onChange: (v: number) => setMusicMix(v), cls: "dj-slider-cyan" },
              { label: "Locução", icon: <Mic2 className="w-3 h-3" />, color: "var(--dj-magenta)", value: jingleMix, testId: "slider-jingle-mix", onChange: (v: number) => setJingleMix(v), cls: "dj-slider-magenta" },
              { label: "Master", icon: <Volume2 className="w-3 h-3" />, color: "var(--dj-text)", value: displayVolume, testId: "slider-volume", onChange: (v: number) => { setMasterVolume(v); if (v > 0 && muted) setMuted(false); }, cls: "" },
            ].map(({ label, icon, color, value, testId, onChange, cls }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="flex-none" style={{ color }}>{icon}</span>
                <span className="text-[9px] uppercase tracking-widest font-bold w-12 flex-none" style={{ color }}>{label}</span>
                <input data-testid={testId} type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={label} className={`dj-progress flex-1 ${cls}`} />
                <span className="text-[9px] dj-mono text-[var(--dj-muted)] flex-none w-10 text-right">{getDbLevel(value)}</span>
              </div>
            ))}
          </div>

          {/* ── DESKTOP: VU meters + vertical sliders ── */}
          {(["L", "R"] as const).map((channel) => (
            <div key={channel} className="hidden lg:flex h-10 border-b border-[var(--dj-border)] items-center px-6 gap-4 bg-[#0a0f1a] flex-none">
              <div className="text-[10px] text-[var(--dj-muted)] uppercase font-bold w-6 text-right">{channel}</div>
              <div className="flex-1 flex gap-[2px] h-3">
                {Array.from({ length: 40 }).map((_, i) => {
                  const threshold = i / 40;
                  const dynamic = isPlaying && !muted
                    ? displayVolume * (0.55 + ((Math.sin(Date.now() / 200 + i + (channel === "L" ? 0 : 1.7)) + 1) / 2) * 0.45)
                    : 0;
                  const active = threshold < dynamic;
                  const isPeak = threshold > 0.8;
                  return <div key={i} className={`flex-1 rounded-sm ${!active ? "bg-[var(--dj-accent)] opacity-30" : isPeak ? "bg-red-500 shadow-[0_0_5px_red]" : "bg-[#00ff00] shadow-[0_0_5px_#00ff00]"}`} />;
                })}
              </div>
            </div>
          ))}

          <div className="hidden lg:flex flex-1 px-8 py-6 justify-between relative min-h-0">
            <div className="absolute inset-y-6 left-8 right-8 flex flex-col justify-between pointer-events-none opacity-20 border-y border-[var(--dj-border)]">
              {[0, -6, -12, -24, -48].map((db) => (
                <div key={db} className="w-full flex items-center gap-2">
                  <div className="text-[9px] dj-mono w-8 text-right text-[var(--dj-text)]">{db}</div>
                  <div className="flex-1 h-px border-t border-dashed border-[var(--dj-text)]" />
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center z-10 w-20 min-h-0">
              <div className="flex-1 py-4 min-h-0 w-4">
                <input data-testid="slider-music-mix" type="range" min={0} max={1} step={0.01} value={musicMix} onChange={(e) => setMusicMix(parseFloat(e.target.value))} aria-label="Volume de músicas" className="dj-vertical-slider dj-slider-cyan" />
              </div>
              <div className="text-center mt-2 flex-none">
                <div className="w-9 h-9 rounded-full bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center mx-auto mb-1.5 text-[var(--dj-cyan)] shadow-[0_0_10px_var(--dj-cyan-glow)]"><Music className="w-4 h-4" /></div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dj-cyan)]">Música</div>
                <div className="text-[10px] dj-mono text-[var(--dj-muted)] mt-0.5">{getDbLevel(musicMix)}</div>
              </div>
            </div>
            <div className="flex flex-col items-center z-10 w-20 min-h-0">
              <div className="flex-1 py-4 min-h-0 w-4">
                <input data-testid="slider-jingle-mix" type="range" min={0} max={1} step={0.01} value={jingleMix} onChange={(e) => setJingleMix(parseFloat(e.target.value))} aria-label="Volume de locuções" className="dj-vertical-slider dj-slider-magenta" />
              </div>
              <div className="text-center mt-2 flex-none">
                <div className="w-9 h-9 rounded-full bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center mx-auto mb-1.5 text-[var(--dj-magenta)] shadow-[0_0_10px_var(--dj-magenta-glow)]"><Mic2 className="w-4 h-4" /></div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dj-magenta)]">Locução</div>
                <div className="text-[10px] dj-mono text-[var(--dj-muted)] mt-0.5">{getDbLevel(jingleMix)}</div>
              </div>
            </div>
            <div className="flex flex-col items-center z-10 w-20 min-h-0">
              <div className="flex-1 py-4 min-h-0 w-4">
                <input data-testid="slider-volume" type="range" min={0} max={1} step={0.01} value={displayVolume} onChange={(e) => { const v = parseFloat(e.target.value); setMasterVolume(v); if (v > 0 && muted) setMuted(false); }} aria-label="Volume geral (master)" className="dj-vertical-slider" />
              </div>
              <div className="text-center mt-2 flex-none">
                <div className="w-9 h-9 rounded-full bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center mx-auto mb-1.5 text-[var(--dj-text)]"><Volume2 className="w-4 h-4" /></div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dj-text)]">Master</div>
                <div className="text-[10px] dj-mono text-[var(--dj-muted)] mt-0.5">{getDbLevel(displayVolume)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

