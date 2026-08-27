import { useState } from "react";
import {
  Radio, Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Sliders, Music, Mic,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./_group.css";

const LOGO = "/__mockup/images/play-comunique-logo.png";

type MockTrack = {
  id: number;
  title: string;
  artist: string | null;
  type: "music" | "jingle";
  coverUrl?: string | null;
};

const MOCK_QUEUE: MockTrack[] = [
  { id: 1, title: "ES Just a Feeling Windshield", artist: "Various Artists", type: "music" },
  { id: 2, title: "PAULMEM FASHION 1 ATÉ 25/10", artist: "Locução", type: "jingle" },
  { id: 3, title: "ES Supernovas Hallman", artist: "Hallman", type: "music" },
  { id: 4, title: "PAULMEM KIDS 2 ATÉ 25/10", artist: "Locução", type: "jingle" },
  { id: 5, title: "ES Flip Side ALICE", artist: "ALICE", type: "music" },
  { id: 6, title: "PAULMEM FASHION 2 ATÉ 25/10", artist: "Locução", type: "jingle" },
];

export function Current() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(72);
  const [duration] = useState(208);
  const [masterVolume, setMasterVolume] = useState(0.7);
  const [musicMix, setMusicMix] = useState(1);
  const [jingleMix, setJingleMix] = useState(0.85);
  const [muted, setMuted] = useState(false);

  const items = MOCK_QUEUE;
  const currentItem = items[currentIdx]!;
  const upcoming = Array.from({ length: Math.min(6, items.length) }, (_, k) => ({
    item: items[(currentIdx + k) % items.length]!,
    absoluteIdx: (currentIdx + k) % items.length,
  }));
  const displayVolume = muted ? 0 : masterVolume;

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="radio-indoor-scope h-screen bg-sidebar flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-sidebar-border flex-none">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
          <Radio className="w-4 h-4 text-sidebar-primary-foreground" />
        </div>
        <span className="text-sm font-medium text-sidebar-foreground">Radio Indoor</span>
        <span className="ml-auto text-xs text-sidebar-foreground/30 truncate max-w-[40%]">
          admin@radioindoor.com
        </span>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Player */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
          {/* Cover */}
          <div className="w-40 h-40 lg:w-52 lg:h-52 rounded-2xl bg-black border border-sidebar-border flex items-center justify-center mb-6 shadow-2xl overflow-hidden flex-none">
            <img src={LOGO} alt="Play-Comunique" className="w-full h-full object-contain p-3" />
          </div>

          {/* Now Playing */}
          <div className="text-center mb-5 min-h-[60px]">
            <p className="text-lg font-semibold text-sidebar-foreground truncate max-w-md">
              {currentItem.title}
            </p>
            <p className="text-xs text-sidebar-foreground/50 mt-0.5">{currentItem.artist ?? "–"}</p>
            <span
              className={`text-[10px] px-2 py-0.5 rounded mt-1.5 inline-block ${
                currentItem.type === "music"
                  ? "bg-blue-500/10 text-blue-400"
                  : "bg-purple-500/10 text-purple-400"
              }`}
            >
              {currentItem.type === "music" ? "Música" : "Locução"}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full max-w-md mb-5">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={currentTime}
              onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
              className="w-full accent-sidebar-primary cursor-pointer h-1.5"
            />
            <div className="flex justify-between text-[11px] font-mono text-sidebar-foreground/50 mt-1">
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6 mb-6">
            <button
              onClick={() => setCurrentIdx((i) => (i - 1 + items.length) % items.length)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground transition-all"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="w-14 h-14 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-lg"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>
            <button
              onClick={() => setCurrentIdx((i) => (i + 1) % items.length)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground transition-all"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Volume */}
          <div className="w-full max-w-md flex items-center gap-3">
            <button
              onClick={() => setMuted((m) => !m)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all flex-none"
            >
              {muted || masterVolume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.01}
              value={displayVolume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setMasterVolume(v);
                if (v > 0 && muted) setMuted(false);
              }}
              className="flex-1 accent-sidebar-primary cursor-pointer h-1.5"
            />
            <span className="text-xs font-mono text-sidebar-foreground/50 w-10 text-right">
              {Math.round(displayVolume * 100)}%
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all flex-none"
                  title="Mixer"
                >
                  <Sliders className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 bg-sidebar border-sidebar-border">
                <p className="text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wide mb-3">
                  Mixer
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Music className="w-4 h-4 text-blue-400 flex-none" />
                    <span className="text-xs text-sidebar-foreground/70 w-16">Música</span>
                    <input
                      type="range" min={0} max={1} step={0.01}
                      value={musicMix}
                      onChange={(e) => setMusicMix(parseFloat(e.target.value))}
                      className="flex-1 accent-blue-400 h-1.5"
                    />
                    <span className="text-[11px] font-mono text-sidebar-foreground/50 w-9 text-right">
                      {Math.round(musicMix * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mic className="w-4 h-4 text-purple-400 flex-none" />
                    <span className="text-xs text-sidebar-foreground/70 w-16">Locução</span>
                    <input
                      type="range" min={0} max={1} step={0.01}
                      value={jingleMix}
                      onChange={(e) => setJingleMix(parseFloat(e.target.value))}
                      className="flex-1 accent-purple-400 h-1.5"
                    />
                    <span className="text-[11px] font-mono text-sidebar-foreground/50 w-9 text-right">
                      {Math.round(jingleMix * 100)}%
                    </span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Queue (next 5) */}
        <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-sidebar-border flex flex-col flex-none lg:max-h-none max-h-[40vh]">
          <div className="px-4 py-3 border-b border-sidebar-border flex-none">
            <p className="text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wide">
              Próximas Faixas
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-sidebar-border">
            {upcoming.map(({ item, absoluteIdx }, displayPos) => {
              const isCurrent = displayPos === 0;
              return (
                <div
                  key={`${absoluteIdx}-${item.id}`}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-sidebar-accent transition-colors ${
                    isCurrent ? "bg-sidebar-primary/10" : ""
                  }`}
                  onClick={() => setCurrentIdx(absoluteIdx)}
                >
                  <span className="text-xs font-mono text-sidebar-foreground/30 w-5">
                    {displayPos === 0 ? "▶" : displayPos}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isCurrent ? "text-sidebar-primary font-medium" : "text-sidebar-foreground/80"}`}>
                      {item.title}
                    </p>
                    <p className="text-xs text-sidebar-foreground/40 truncate">
                      {item.artist ?? "–"}
                    </p>
                  </div>
                  {isCurrent && isPlaying && (
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map((j) => (
                        <div
                          key={j}
                          className="w-0.5 h-3 bg-sidebar-primary rounded-full animate-pulse"
                          style={{ animationDelay: `${j * 0.1}s` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
