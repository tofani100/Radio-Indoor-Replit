import React, { useState, useEffect } from "react";
import { 
  Play, Pause, SkipForward, SkipBack, Radio, 
  Activity, Headphones, Clock, Volume2, VolumeX,
  Mic2, Music, SlidersHorizontal, Hash, AlertCircle 
} from "lucide-react";
import "./_djconsole.css";

const LOGO = "/__mockup/images/play-comunique-logo.png";

type MockTrack = {
  id: number;
  title: string;
  artist: string | null;
  type: "music" | "jingle";
  duration: number;
};

const MOCK_QUEUE: MockTrack[] = [
  { id: 1, title: "Midnight City", artist: "M83", type: "music", duration: 243 },
  { id: 2, title: "PROMOÇÃO RELÂMPAGO - FIM DE SEMANA", artist: "Locução Comercial", type: "jingle", duration: 15 },
  { id: 3, title: "Blinding Lights", artist: "The Weeknd", type: "music", duration: 200 },
  { id: 4, title: "Levitating", artist: "Dua Lipa", type: "music", duration: 203 },
  { id: 5, title: "AVISO - HORÁRIO DE FUNCIONAMENTO", artist: "Locução Institucional", type: "jingle", duration: 20 },
  { id: 6, title: "Watermelon Sugar", artist: "Harry Styles", type: "music", duration: 174 },
  { id: 7, title: "Don't Start Now", artist: "Dua Lipa", type: "music", duration: 183 },
  { id: 8, title: "As It Was", artist: "Harry Styles", type: "music", duration: 167 },
  { id: 9, title: "CHAMADA - CLUBE DE PONTOS", artist: "Locução Comercial", type: "jingle", duration: 30 },
  { id: 10, title: "Cold Heart", artist: "Elton John, Dua Lipa", type: "music", duration: 202 },
  { id: 11, title: "Save Your Tears", artist: "The Weeknd", type: "music", duration: 215 },
  { id: 12, title: "MENSAGEM DE ENCERRAMENTO", artist: "Locução Institucional", type: "jingle", duration: 25 },
];

export function DJConsole() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(45);
  
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [musicMix, setMusicMix] = useState(1.0);
  const [jingleMix, setJingleMix] = useState(0.9);
  const [muted, setMuted] = useState(false);

  const items = MOCK_QUEUE;
  const currentItem = items[currentIdx]!;
  const duration = currentItem.duration;

  // Mock progress
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime(t => {
        if (t >= duration) {
          setCurrentIdx(i => (i + 1) % items.length);
          return 0;
        }
        return t + 0.5;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying, duration, items.length]);

  // When track changes manually, reset time
  useEffect(() => {
    setCurrentTime(0);
  }, [currentIdx]);

  const upcoming = Array.from({ length: 12 }, (_, k) => {
    const idx = (currentIdx + k) % items.length;
    return { item: items[idx]!, absoluteIdx: idx };
  });

  const nextJingleIndex = upcoming.findIndex(u => u.item.type === "jingle" && u.absoluteIdx !== currentIdx);
  const tracksUntilJingle = nextJingleIndex > 0 ? nextJingleIndex : null;

  const fmt = (s: number) => {
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

  return (
    <div className="dj-console-scope h-screen w-full flex flex-col p-4 gap-4 box-border overflow-hidden select-none">
      
      {/* Top Header */}
      <header className="flex-none h-14 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg flex items-center justify-between px-6 shadow-lg">
        <div className="flex items-center gap-4">
          <img src={LOGO} alt="Play-Comunique" className="h-6 object-contain grayscale brightness-200" />
          <div className="w-[1px] h-6 bg-[var(--dj-border)]"></div>
          <span className="text-[var(--dj-cyan)] font-bold tracking-widest text-sm uppercase flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Operator Console Pro
          </span>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Activity className="w-4 h-4 text-[var(--dj-cyan)]" />
            <span className="text-[var(--dj-muted)] uppercase">BPM</span>
            <span className="dj-mono text-[var(--dj-text)] bg-[var(--dj-bg)] px-2 py-1 rounded border border-[var(--dj-border)]">124</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Headphones className="w-4 h-4 text-[var(--dj-magenta)]" />
            <span className="text-[var(--dj-muted)] uppercase">Conectados</span>
            <span className="dj-mono text-[var(--dj-text)] bg-[var(--dj-bg)] px-2 py-1 rounded border border-[var(--dj-border)]">12</span>
          </div>
          <div className="flex items-center gap-2 bg-[#ff005515] border border-[var(--dj-magenta)] text-[var(--dj-magenta)] px-3 py-1.5 rounded uppercase text-xs font-bold tracking-widest">
            <div className="w-2 h-2 rounded-full bg-[var(--dj-magenta)] dj-animate-live"></div>
            Ao Vivo
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex gap-4">
        
        {/* Left Column: NOW PLAYING & WAVEFORM */}
        <div className="w-1/3 flex flex-col gap-4">
          <div className="flex-1 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg flex flex-col p-6 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--dj-cyan)] to-[var(--dj-magenta)] opacity-50"></div>
            
            <h2 className="text-xs uppercase font-bold text-[var(--dj-muted)] tracking-widest mb-6 flex justify-between">
              <span>Status de Reprodução</span>
              <span className="dj-mono text-[var(--dj-cyan)]">{fmt(currentTime)} / {fmt(duration)}</span>
            </h2>

            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <div className="w-48 h-48 rounded-full bg-[#0a0f1a] border-4 border-[var(--dj-border)] shadow-[0_0_40px_rgba(0,240,255,0.1)] flex items-center justify-center mb-8 relative group overflow-hidden">
                <img src={LOGO} alt="Cover" className={`w-24 h-24 object-contain transition-transform duration-1000 ${isPlaying ? 'scale-110' : 'scale-100'}`} />
                {isPlaying && (
                  <div className="absolute inset-0 border-4 border-[var(--dj-cyan)] rounded-full opacity-20 dj-animate-live"></div>
                )}
              </div>

              <div className="w-full">
                <div className={`text-[10px] uppercase font-bold px-3 py-1 rounded inline-flex items-center gap-1.5 mb-4 border ${
                  currentItem.type === "music" 
                    ? "bg-[var(--dj-cyan-glow)] text-[var(--dj-cyan)] border-[var(--dj-cyan)]" 
                    : "bg-[var(--dj-magenta-glow)] text-[var(--dj-magenta)] border-[var(--dj-magenta)]"
                }`}>
                  {currentItem.type === "music" ? <Music className="w-3 h-3" /> : <Mic2 className="w-3 h-3" />}
                  {currentItem.type === "music" ? "Música" : "Locução"}
                </div>
                
                <h1 className="text-3xl font-bold text-[var(--dj-text)] truncate w-full mb-2 tracking-tight">
                  {currentItem.title}
                </h1>
                <p className="text-[var(--dj-muted)] text-lg truncate w-full">
                  {currentItem.artist ?? "Desconhecido"}
                </p>
              </div>
            </div>

            {/* Mock Waveform */}
            <div className="h-16 mt-6 flex items-end gap-1 w-full opacity-80">
              {Array.from({ length: 40 }).map((_, i) => {
                const isActive = (i / 40) < (currentTime / duration);
                const height = 20 + Math.sin(i * 0.5) * 15 + Math.random() * 20;
                return (
                  <div 
                    key={i} 
                    className={`flex-1 rounded-t-sm transition-colors duration-200 ${
                      isActive 
                        ? (currentItem.type === 'music' ? 'bg-[var(--dj-cyan)] shadow-[0_0_8px_var(--dj-cyan)]' : 'bg-[var(--dj-magenta)] shadow-[0_0_8px_var(--dj-magenta)]')
                        : 'bg-[var(--dj-accent)]'
                    } ${isPlaying && isActive ? `dj-vu-bar dj-vu-${(i % 12) + 1}` : ''}`}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex-none h-24 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg flex items-center justify-center gap-6 shadow-lg">
            <button 
              onClick={() => setCurrentIdx((i) => (i - 1 + items.length) % items.length)}
              className="w-12 h-12 rounded bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center hover:bg-[var(--dj-accent)] transition-colors text-[var(--dj-text)]"
            >
              <SkipBack className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setIsPlaying(p => !p)}
              className={`w-16 h-16 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all ${
                isPlaying 
                  ? 'bg-[var(--dj-cyan)] text-[#060a14] shadow-[0_0_15px_var(--dj-cyan-glow)]' 
                  : 'bg-[var(--dj-accent)] text-[var(--dj-text)]'
              }`}
            >
              {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
            </button>
            <button 
              onClick={() => setCurrentIdx((i) => (i + 1) % items.length)}
              className="w-12 h-12 rounded bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center hover:bg-[var(--dj-accent)] transition-colors text-[var(--dj-text)]"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Center Column: QUEUE */}
        <div className="w-1/3 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg shadow-lg flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--dj-border)] flex items-center justify-between bg-[var(--dj-bg)]/50">
            <h2 className="text-xs uppercase font-bold text-[var(--dj-muted)] tracking-widest flex items-center gap-2">
              <Hash className="w-4 h-4" /> Fila de Reprodução
            </h2>
            {tracksUntilJingle !== null && (
              <div className="flex items-center gap-2 bg-[var(--dj-magenta-glow)] border border-[var(--dj-magenta)] text-[var(--dj-magenta)] px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider">
                <AlertCircle className="w-3 h-3" />
                T-{tracksUntilJingle} para locução
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <div className="p-2 space-y-1">
              {upcoming.map(({ item, absoluteIdx }, displayPos) => {
                const isCurrent = displayPos === 0;
                const isJingle = item.type === "jingle";
                
                return (
                  <div 
                    key={`${absoluteIdx}-${displayPos}`}
                    onClick={() => setCurrentIdx(absoluteIdx)}
                    className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors group border ${
                      isCurrent 
                        ? (isJingle ? "bg-[var(--dj-magenta-glow)] border-[var(--dj-magenta)]" : "bg-[var(--dj-cyan-glow)] border-[var(--dj-cyan)]") 
                        : "bg-transparent border-transparent hover:bg-[var(--dj-panel-hover)]"
                    }`}
                  >
                    <div className="w-6 text-center text-xs dj-mono text-[var(--dj-muted)]">
                      {isCurrent ? (isPlaying ? <Activity className={`w-4 h-4 mx-auto ${isJingle ? 'text-[var(--dj-magenta)]' : 'text-[var(--dj-cyan)]'}`} /> : "⏸") : displayPos}
                    </div>
                    
                    <div className="w-1.5 h-8 rounded-full flex-none bg-[var(--dj-accent)] overflow-hidden">
                      <div className={`w-full h-full ${isJingle ? 'bg-[var(--dj-magenta)]' : 'bg-[var(--dj-cyan)]'} ${isCurrent ? 'opacity-100' : 'opacity-30 group-hover:opacity-60'}`}></div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${
                        isCurrent ? (isJingle ? 'text-[var(--dj-magenta)]' : 'text-[var(--dj-cyan)]') : 'text-[var(--dj-text)]'
                      }`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-[var(--dj-muted)] truncate mt-0.5">
                        {item.artist}
                      </p>
                    </div>
                    
                    <div className="text-xs dj-mono text-[var(--dj-muted)] flex-none pl-2">
                      {isCurrent ? `-${fmt(duration - currentTime)}` : fmt(item.duration)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: MIXER */}
        <div className="w-1/3 bg-[var(--dj-panel)] border border-[var(--dj-border)] rounded-lg shadow-lg flex flex-col overflow-hidden relative">
          
          <div className="px-5 py-4 border-b border-[var(--dj-border)] flex justify-between items-center bg-[var(--dj-bg)]/50">
            <h2 className="text-xs uppercase font-bold text-[var(--dj-muted)] tracking-widest flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" /> Mixer Multi-Canal
            </h2>
            <button 
              onClick={() => setMuted(!muted)}
              className={`p-1.5 rounded transition-colors ${muted ? 'bg-[var(--dj-magenta)] text-white' : 'bg-[var(--dj-bg)] text-[var(--dj-muted)] border border-[var(--dj-border)]'}`}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Master Output Meter */}
          <div className="h-12 border-b border-[var(--dj-border)] flex items-center px-6 gap-4 bg-[#0a0f1a]">
            <div className="text-[10px] text-[var(--dj-muted)] uppercase font-bold w-12 text-right">L</div>
            <div className="flex-1 flex gap-[2px] h-3">
              {Array.from({ length: 40 }).map((_, i) => {
                const threshold = i / 40;
                const active = isPlaying && !muted && threshold < masterVolume * (0.6 + Math.random() * 0.4);
                const isPeak = threshold > 0.8;
                return (
                  <div key={i} className={`flex-1 rounded-sm ${
                    !active ? 'bg-[var(--dj-accent)] opacity-30' : 
                    isPeak ? 'bg-red-500 shadow-[0_0_5px_red]' : 
                    'bg-[#00ff00] shadow-[0_0_5px_#00ff00]'
                  }`} />
                )
              })}
            </div>
          </div>
          <div className="h-12 border-b border-[var(--dj-border)] flex items-center px-6 gap-4 bg-[#0a0f1a]">
            <div className="text-[10px] text-[var(--dj-muted)] uppercase font-bold w-12 text-right">R</div>
            <div className="flex-1 flex gap-[2px] h-3">
              {Array.from({ length: 40 }).map((_, i) => {
                const threshold = i / 40;
                const active = isPlaying && !muted && threshold < masterVolume * (0.6 + Math.random() * 0.4);
                const isPeak = threshold > 0.8;
                return (
                  <div key={i} className={`flex-1 rounded-sm ${
                    !active ? 'bg-[var(--dj-accent)] opacity-30' : 
                    isPeak ? 'bg-red-500 shadow-[0_0_5px_red]' : 
                    'bg-[#00ff00] shadow-[0_0_5px_#00ff00]'
                  }`} />
                )
              })}
            </div>
          </div>

          <div className="flex-1 flex px-8 py-8 justify-between relative">
            {/* DB Guide Background */}
            <div className="absolute inset-y-8 left-8 right-8 flex flex-col justify-between pointer-events-none opacity-20 border-y border-[var(--dj-border)]">
              {[0, -6, -12, -24, -48].map((db, i) => (
                <div key={db} className="w-full flex items-center gap-2">
                  <div className="text-[9px] dj-mono w-8 text-right text-[var(--dj-text)]">{db}</div>
                  <div className="flex-1 h-[1px] bg-[var(--dj-text)] border-t border-dashed border-[var(--dj-text)]"></div>
                </div>
              ))}
            </div>

            {/* Sliders */}
            <div className="flex flex-col items-center z-10 w-20">
              <div className="h-full py-4">
                <input 
                  type="range" {...({ orient: "vertical" } as any)} min={0} max={1} step={0.01}
                  value={musicMix} onChange={e => setMusicMix(parseFloat(e.target.value))}
                  className="dj-vertical-slider dj-slider-cyan"
                />
              </div>
              <div className="text-center mt-2">
                <div className="w-10 h-10 rounded-full bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center mx-auto mb-2 text-[var(--dj-cyan)] shadow-[0_0_10px_var(--dj-cyan-glow)]">
                  <Music className="w-4 h-4" />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dj-cyan)]">Música</div>
                <div className="text-[10px] dj-mono text-[var(--dj-muted)] mt-1">{getDbLevel(musicMix)}</div>
              </div>
            </div>

            <div className="flex flex-col items-center z-10 w-20">
              <div className="h-full py-4">
                <input 
                  type="range" {...({ orient: "vertical" } as any)} min={0} max={1} step={0.01}
                  value={jingleMix} onChange={e => setJingleMix(parseFloat(e.target.value))}
                  className="dj-vertical-slider dj-slider-magenta"
                />
              </div>
              <div className="text-center mt-2">
                <div className="w-10 h-10 rounded-full bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center mx-auto mb-2 text-[var(--dj-magenta)] shadow-[0_0_10px_var(--dj-magenta-glow)]">
                  <Mic2 className="w-4 h-4" />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dj-magenta)]">Locução</div>
                <div className="text-[10px] dj-mono text-[var(--dj-muted)] mt-1">{getDbLevel(jingleMix)}</div>
              </div>
            </div>

            <div className="flex flex-col items-center z-10 w-20">
              <div className="h-full py-4">
                <input 
                  type="range" {...({ orient: "vertical" } as any)} min={0} max={1} step={0.01}
                  value={masterVolume} onChange={e => setMasterVolume(parseFloat(e.target.value))}
                  className="dj-vertical-slider"
                />
              </div>
              <div className="text-center mt-2">
                <div className="w-10 h-10 rounded-full bg-[var(--dj-bg)] border border-[var(--dj-border)] flex items-center justify-center mx-auto mb-2 text-[var(--dj-text)]">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dj-text)]">Master</div>
                <div className="text-[10px] dj-mono text-[var(--dj-muted)] mt-1">{getDbLevel(masterVolume)}</div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
