import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Sliders, Settings, Music, Mic } from "lucide-react";
import "./_tvmode.css";

const LOGO = "/__mockup/images/play-comunique-logo.png";

type MockTrack = {
  id: number;
  title: string;
  artist: string | null;
  type: "music" | "jingle";
  coverColor: string;
};

const MOCK_QUEUE: MockTrack[] = [
  { id: 1, title: "Midnight City Lights", artist: "Synthwave Collective", type: "music", coverColor: "from-indigo-900 via-purple-900 to-black" },
  { id: 2, title: "OFERTA RELÂMPAGO SUPERMERCADO", artist: "Locução Promocional", type: "jingle", coverColor: "from-amber-600 via-orange-900 to-black" },
  { id: 3, title: "Ocean Breeze", artist: "Chillout Lounge", type: "music", coverColor: "from-cyan-900 via-blue-900 to-black" },
  { id: 4, title: "DIA DAS MÃES SHOPPING", artist: "Campanha Especial", type: "jingle", coverColor: "from-rose-600 via-pink-900 to-black" },
  { id: 5, title: "Neon Dreams", artist: "The Midnight", type: "music", coverColor: "from-fuchsia-900 via-purple-900 to-black" },
  { id: 6, title: "Coffee Shop Acoustics", artist: "Acoustic Alchemy", type: "music", coverColor: "from-stone-800 via-neutral-900 to-black" },
];

export function TVMode() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const duration = 215; // mock duration
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [musicMix, setMusicMix] = useState(1);
  const [jingleMix, setJingleMix] = useState(0.9);
  const [muted, setMuted] = useState(false);

  const items = MOCK_QUEUE;
  const currentItem = items[currentIdx];

  // Auto advance
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((t) => {
        if (t >= duration) {
          setCurrentIdx((i) => (i + 1) % items.length);
          return 0;
        }
        return t + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, duration, items.length]);

  // Reset time on track change
  useEffect(() => {
    setCurrentTime(0);
  }, [currentIdx]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const isJingle = currentItem.type === "jingle";

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden tv-container font-sans text-white select-none">
      {/* Background artwork/gradient */}
      <div 
        key={currentItem.id}
        className={`absolute inset-0 bg-gradient-to-br ${currentItem.coverColor} opacity-60 animate-ken-burns transition-opacity duration-1000`}
      />
      
      {isJingle && (
        <div className="absolute inset-0 bg-amber-500/10 jingle-glow pointer-events-none mix-blend-overlay" />
      )}

      {/* Noise overlay for cinematic feel */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }}></div>

      {/* Main Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-16 lg:p-24 pb-32 lg:pb-40 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
        
        {/* Brand */}
        <div className="absolute top-12 left-12 lg:top-16 lg:left-16 flex items-center gap-4 opacity-80">
          <div className="w-16 h-16 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center p-3 shadow-2xl">
            <img src={LOGO} alt="Play-Comunique" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-widest uppercase">Play<span className="font-light text-white/70">Comunique</span></span>
            <span className="text-xs tracking-[0.2em] text-white/50 uppercase">Rádio Indoor</span>
          </div>
        </div>

        {/* Now Playing Info */}
        <div key={`info-${currentItem.id}`} className="animate-slide-up-fade max-w-5xl">
          {isJingle && (
            <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-sm font-bold tracking-widest text-amber-400 uppercase">Anúncio Patrocinado</span>
            </div>
          )}
          {!isJingle && (
            <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md">
              <Music className="w-4 h-4 text-white/70" />
              <span className="text-sm font-medium tracking-widest text-white/70 uppercase">Música</span>
            </div>
          )}

          <h1 
            className="text-[80px] lg:text-[120px] font-bold leading-none tracking-tight mb-4" 
            style={{ fontFamily: "'Bebas Neue', 'Playfair Display', sans-serif" }}
          >
            {currentItem.title}
          </h1>
          <p className="text-3xl lg:text-4xl font-light text-white/70 tracking-wide">
            {currentItem.artist}
          </p>
        </div>

        {/* Ambient Progress Bar */}
        <div className="absolute bottom-0 left-0 w-full h-2 bg-white/10">
          <div 
            className={`h-full transition-all duration-1000 ease-linear ${isJingle ? 'bg-amber-500' : 'bg-white'}`}
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      </div>

      {/* Hidden Admin Panel (Hover to reveal) */}
      <div className="admin-panel absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl flex gap-8 z-50">
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-widest text-white/50 uppercase">Controles do Operador</span>
            <div className="flex items-center gap-4 text-white/50 text-sm font-mono">
              <span>{fmt(currentTime)} / {fmt(duration)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <button onClick={() => setCurrentIdx((i) => (i - 1 + items.length) % items.length)} className="p-3 rounded-full hover:bg-white/10 transition-colors">
              <SkipBack className="w-6 h-6" />
            </button>
            <button onClick={() => setIsPlaying(!isPlaying)} className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform">
              {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
            </button>
            <button onClick={() => setCurrentIdx((i) => (i + 1) % items.length)} className="p-3 rounded-full hover:bg-white/10 transition-colors">
              <SkipForward className="w-6 h-6" />
            </button>

            <div className="h-10 w-px bg-white/10 mx-2" />

            {/* Master Volume */}
            <div className="flex items-center gap-3 flex-1">
              <button onClick={() => setMuted(!muted)} className="p-2 text-white/70 hover:text-white">
                {muted || masterVolume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range" min={0} max={1} step={0.01}
                value={muted ? 0 : masterVolume}
                onChange={(e) => {
                  setMasterVolume(parseFloat(e.target.value));
                  if (muted) setMuted(false);
                }}
                className="flex-1 accent-white h-1.5 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
              />
            </div>
          </div>

          {/* Mixer */}
          <div className="flex items-center gap-8 mt-2 p-4 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-4 flex-1">
              <Music className="w-4 h-4 text-white/50" />
              <span className="text-xs uppercase tracking-wider text-white/70 w-16">Música</span>
              <input type="range" min={0} max={1} step={0.01} value={musicMix} onChange={(e) => setMusicMix(parseFloat(e.target.value))} className="flex-1 accent-blue-400 h-1" />
            </div>
            <div className="flex items-center gap-4 flex-1">
              <Mic className="w-4 h-4 text-white/50" />
              <span className="text-xs uppercase tracking-wider text-white/70 w-16">Locução</span>
              <input type="range" min={0} max={1} step={0.01} value={jingleMix} onChange={(e) => setJingleMix(parseFloat(e.target.value))} className="flex-1 accent-amber-400 h-1" />
            </div>
          </div>
        </div>

        {/* Queue */}
        <div className="w-64 flex flex-col gap-3 pl-8 border-l border-white/10">
          <span className="text-xs font-bold tracking-widest text-white/50 uppercase">Próximas Faixas</span>
          <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
            {items.slice(currentIdx + 1, currentIdx + 4).map((item) => (
              <div key={item.id} className="flex items-center gap-3 opacity-70">
                <div className={`w-8 h-8 rounded flex items-center justify-center bg-gradient-to-br ${item.coverColor}`}>
                  {item.type === 'jingle' ? <Mic className="w-3 h-3 text-white/70" /> : <Music className="w-3 h-3 text-white/70" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate w-32">{item.title}</p>
                  <p className="text-[10px] text-white/50 truncate w-32">{item.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
    </div>
  );
}
