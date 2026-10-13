import { useEffect, useState, type RefObject } from "react";

/**
 * Relógio de reprodução isolado.
 *
 * O tempo atual da faixa NÃO fica no estado da página do player: cada
 * componente abaixo lê `audio.currentTime` diretamente e re-renderiza apenas a
 * si mesmo. Isso evita redesenhar a página inteira (e a fila completa) várias
 * vezes por segundo, que causava o contador "pulando" e o aquecimento do
 * aparelho. Com a página oculta (tela apagada) nada é atualizado.
 */
type AudioRef = RefObject<HTMLAudioElement | null>;

const TICK_MS = 250;

export function fmtMMSS(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "00:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

function readTime(a: HTMLAudioElement | null): number {
  return a && Number.isFinite(a.currentTime) ? a.currentTime : 0;
}

function readDuration(a: HTMLAudioElement | null, fallback: number): number {
  if (a && Number.isFinite(a.duration) && a.duration > 0) return a.duration;
  return fallback > 0 ? fallback : 0;
}

/** Lê o tempo da faixa em intervalos curtos, apenas com a página visível. */
export function useAudioTime(audioRef: AudioRef, resolution = 0.2) {
  const [time, setTime] = useState(() => readTime(audioRef.current));

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const t = readTime(audioRef.current);
      setTime((prev) => (Math.abs(prev - t) >= resolution ? t : prev));
    };
    const start = () => {
      if (id !== null || document.hidden) return;
      tick();
      id = setInterval(tick, TICK_MS);
    };
    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [audioRef, resolution]);

  return [time, setTime] as const;
}

export function TimeLabel({
  audioRef,
  duration,
  className,
}: {
  audioRef: AudioRef;
  duration: number;
  className?: string;
}) {
  const [time] = useAudioTime(audioRef, 0.5);
  const total = readDuration(audioRef.current, duration);
  return (
    <span className={className}>
      {fmtMMSS(time)} / {fmtMMSS(total)}
    </span>
  );
}

export function RemainingLabel({ audioRef, duration }: { audioRef: AudioRef; duration: number }) {
  const [time] = useAudioTime(audioRef, 0.5);
  const total = readDuration(audioRef.current, duration);
  return <>{`-${fmtMMSS(Math.max(0, total - time))}`}</>;
}

export function ProgressSlider({
  audioRef,
  duration,
  onSeek,
}: {
  audioRef: AudioRef;
  duration: number;
  onSeek: (value: number) => void;
}) {
  const [time, setTime] = useAudioTime(audioRef, 0.1);
  const total = readDuration(audioRef.current, duration);
  return (
    <input
      data-testid="slider-progress"
      type="range"
      min={0}
      max={total || 1}
      step={0.01}
      value={Math.min(time, total || 1)}
      disabled={!total}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        setTime(v);
        onSeek(v);
      }}
      aria-label="Posição da faixa"
      className="dj-progress"
    />
  );
}

export function VuMeter({
  audioRef,
  duration,
  isPlaying,
  itemType,
}: {
  audioRef: AudioRef;
  duration: number;
  isPlaying: boolean;
  itemType?: string;
}) {
  const [time] = useAudioTime(audioRef, 0.5);
  const total = readDuration(audioRef.current, duration);
  const ratio = total > 0 ? time / total : 0;
  const activeColor =
    itemType === "jingle"
      ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
      : itemType === "voiceover"
      ? "bg-[var(--dj-magenta)] shadow-[0_0_8px_var(--dj-magenta)]"
      : "bg-[var(--dj-cyan)] shadow-[0_0_8px_var(--dj-cyan)]";
  return (
    <div className="h-12 mt-3 flex items-end gap-[2px] w-full opacity-80 flex-none">
      {Array.from({ length: 40 }).map((_, i) => {
        const isActive = i / 40 < ratio;
        const height = 20 + Math.sin(i * 0.5) * 15 + ((i * 7) % 17);
        return (
          <div
            key={i}
            className={`flex-1 rounded-t-sm transition-colors duration-200 ${isActive ? activeColor : "bg-[var(--dj-accent)]"} ${isPlaying && isActive ? `dj-vu-bar dj-vu-${(i % 12) + 1}` : ""}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}
