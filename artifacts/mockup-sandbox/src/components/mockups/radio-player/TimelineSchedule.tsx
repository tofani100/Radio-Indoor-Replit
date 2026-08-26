import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music, Mic, Clock } from "lucide-react";
import "./_timelineschedule.css";

const LOGO = "/__mockup/images/play-comunique-logo.png";

type TrackType = "music" | "jingle";

interface MockTrack {
  id: number;
  time: string;
  duration: number; // in seconds
  title: string;
  artist: string | null;
  type: TrackType;
  block: "Manhã" | "Tarde" | "Noite";
}

const SCHEDULE_DATA: MockTrack[] = [
  { id: 1, time: "08:00", duration: 180, title: "Abertura Oficial", artist: "Locução", type: "jingle", block: "Manhã" },
  { id: 2, time: "08:03", duration: 210, title: "Morning Vibes", artist: "The Sunrises", type: "music", block: "Manhã" },
  { id: 3, time: "08:06", duration: 195, title: "Cafeína", artist: "Bossa Nova Mix", type: "music", block: "Manhã" },
  { id: 4, time: "08:10", duration: 30, title: "Promoção Dia das Mães", artist: "Locução", type: "jingle", block: "Manhã" },
  { id: 5, time: "08:11", duration: 240, title: "Bom Dia", artist: "Os Acordados", type: "music", block: "Manhã" },
  
  { id: 6, time: "13:00", duration: 185, title: "Almoço Tranquilo", artist: "Piano Trio", type: "music", block: "Tarde" },
  { id: 7, time: "13:03", duration: 220, title: "Tarde de Sol", artist: "Verão", type: "music", block: "Tarde" },
  { id: 8, time: "13:07", duration: 45, title: "Oferta Relâmpago", artist: "Locução", type: "jingle", block: "Tarde" },
  { id: 9, time: "13:08", duration: 200, title: "Passeio no Parque", artist: "Indie Pop", type: "music", block: "Tarde" },
  
  { id: 10, time: "19:00", duration: 215, title: "Fim de Expediente", artist: "Lounge Mix", type: "music", block: "Noite" },
  { id: 11, time: "19:03", duration: 40, title: "Encerramento Lojas", artist: "Locução", type: "jingle", block: "Noite" },
  { id: 12, time: "19:04", duration: 190, title: "Noite Adentro", artist: "Synthwave", type: "music", block: "Noite" },
];

export function TimelineSchedule() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(2); // Start at index 2 (08:06)
  const [currentTime, setCurrentTime] = useState(45); // seconds into current track
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [musicMix, setMusicMix] = useState(1);
  const [jingleMix, setJingleMix] = useState(0.9);
  const [muted, setMuted] = useState(false);
  
  const currentTrack = SCHEDULE_DATA[currentIdx]!;
  const displayVolume = muted ? 0 : masterVolume;
  
  // Ref for the current track element to scroll it into view
  const currentTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentTrackRef.current) {
      currentTrackRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIdx]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= currentTrack.duration) {
            // Next track
            setCurrentIdx((idx) => (idx + 1) % SCHEDULE_DATA.length);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack.duration]);

  const fmtTime = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const blocks = SCHEDULE_DATA.reduce((acc, track, idx) => {
    if (!acc[track.block]) acc[track.block] = [];
    acc[track.block].push({ ...track, originalIdx: idx });
    return acc;
  }, {} as Record<string, (MockTrack & { originalIdx: number })[]>);

  return (
    <div className="radio-timeline-scope h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'hsl(var(--tl-bg))', color: 'hsl(var(--tl-text))' }}>
      
      {/* Top Header: Compact Now Playing */}
      <header className="flex-none flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--tl-border))] bg-[hsl(var(--tl-surface))] z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-black rounded flex items-center justify-center overflow-hidden">
            <img src={LOGO} alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--tl-now))] animate-pulse flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--tl-now))]"></span>
                Ao Vivo
              </span>
              <span className="text-xs font-mono text-[hsl(var(--tl-text-muted))]">
                {currentTrack.time}
              </span>
            </div>
            <h1 className="text-sm font-semibold truncate max-w-[250px]">{currentTrack.title}</h1>
            <p className="text-xs text-[hsl(var(--tl-text-muted))] truncate max-w-[250px]">{currentTrack.artist}</p>
          </div>
        </div>
        
        <div className="text-right flex flex-col items-end">
          <div className="text-xs text-[hsl(var(--tl-text-muted))] mb-1 flex items-center gap-1">
             <Clock className="w-3 h-3" />
             Restante: {fmtTime(currentTrack.duration - currentTime)}
          </div>
          <div className="w-32 h-1.5 bg-[hsl(var(--tl-border))] rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{ 
                width: `${(currentTime / currentTrack.duration) * 100}%`,
                backgroundColor: currentTrack.type === 'music' ? 'hsl(var(--tl-music))' : 'hsl(var(--tl-jingle))'
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content: Vertical Timeline */}
      <main className="flex-1 overflow-y-auto px-6 py-8 relative">
        <div className="max-w-3xl mx-auto">
          
          {Object.entries(blocks).map(([blockName, tracks], blockIdx) => (
            <div key={blockName} className="mb-10">
              <h2 className="text-sm font-bold text-[hsl(var(--tl-text-muted))] uppercase tracking-widest mb-4 sticky top-0 bg-[hsl(var(--tl-bg))] py-2 z-10">
                {blockName}
              </h2>
              
              <div className="relative border-l-2 border-[hsl(var(--tl-border))] ml-3 space-y-6">
                {tracks.map((track) => {
                  const isPast = track.originalIdx < currentIdx;
                  const isCurrent = track.originalIdx === currentIdx;
                  const isFuture = track.originalIdx > currentIdx;
                  
                  const isMusic = track.type === 'music';
                  const typeColor = isMusic ? 'var(--tl-music)' : 'var(--tl-jingle)';
                  const typeBg = isMusic ? 'var(--tl-music-bg)' : 'var(--tl-jingle-bg)';
                  
                  return (
                    <div 
                      key={track.id}
                      ref={isCurrent ? currentTrackRef : null}
                      className={`relative pl-8 transition-all duration-300 ${
                        isPast ? "opacity-40 grayscale" : ""
                      } ${isCurrent ? "scale-[1.02] origin-left" : ""}`}
                    >
                      {/* Timeline Dot */}
                      <div 
                        className={`absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(var(--tl-bg))] transition-colors ${
                          isCurrent ? "bg-[hsl(var(--tl-now))] scale-125 shadow-[0_0_0_4px_hsla(var(--tl-now),0.2)]" : 
                          isPast ? "bg-[hsl(var(--tl-border))]" : `bg-[hsl(${typeColor})]`
                        }`}
                      />
                      
                      {/* Current Time Indicator Line (if current) */}
                      {isCurrent && (
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-[hsl(var(--tl-now))] opacity-20 pointer-events-none z-[-1] -ml-4" />
                      )}

                      <div 
                        className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all hover:border-[hsl(${typeColor})] ${
                          isCurrent ? `bg-[hsl(${typeBg})] border-[hsl(${typeColor})] shadow-md` : 
                          "bg-[hsl(var(--tl-surface))] border-[hsl(var(--tl-border))]"
                        }`}
                        onClick={() => {
                          setCurrentIdx(track.originalIdx);
                          setCurrentTime(0);
                          setIsPlaying(true);
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`text-sm font-mono font-medium ${isCurrent ? `text-[hsl(${typeColor})]` : "text-[hsl(var(--tl-text-muted))]"}`}>
                            {track.time}
                          </div>
                          
                          <div>
                            <p className={`font-semibold ${isCurrent ? "text-base" : "text-sm"}`}>
                              {track.title}
                            </p>
                            <p className="text-xs text-[hsl(var(--tl-text-muted))] mt-0.5">
                              {track.artist} • {fmtTime(track.duration)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                           {isCurrent && isPlaying && (
                              <div className="flex items-end gap-0.5 h-4 mr-2">
                                {[1, 2, 3].map(i => (
                                  <div key={i} className="w-1 bg-[hsl(var(--tl-now))] rounded-t-sm animate-pulse" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.15}s` }} />
                                ))}
                              </div>
                           )}
                           <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md border`}
                                 style={{ 
                                   color: `hsl(${typeColor})`, 
                                   backgroundColor: isCurrent ? 'transparent' : `hsl(${typeBg})`,
                                   borderColor: isCurrent ? `hsla(${typeColor}, 0.3)` : 'transparent'
                                 }}>
                             {isMusic ? "Música" : "Locução"}
                           </span>
                        </div>
                        
                        {/* Inline Progress for current item */}
                        {isCurrent && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[hsl(var(--tl-border))] rounded-b-xl overflow-hidden">
                            <div 
                              className="h-full transition-all duration-1000 ease-linear"
                              style={{ 
                                width: `${(currentTime / track.duration) * 100}%`,
                                backgroundColor: `hsl(${typeColor})`
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Bottom Footer: Controls & Mixer */}
      <footer className="flex-none bg-[hsl(var(--tl-surface))] border-t border-[hsl(var(--tl-border))] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-20">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          
          {/* Transport */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setCurrentIdx((i) => (i - 1 + SCHEDULE_DATA.length) % SCHEDULE_DATA.length)}
              className="p-2 text-[hsl(var(--tl-text-muted))] hover:text-[hsl(var(--tl-text))] transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-12 h-12 rounded-full bg-[hsl(var(--tl-text))] text-[hsl(var(--tl-surface))] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
            </button>
            
            <button 
              onClick={() => setCurrentIdx((i) => (i + 1) % SCHEDULE_DATA.length)}
              className="p-2 text-[hsl(var(--tl-text-muted))] hover:text-[hsl(var(--tl-text))] transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Master Volume */}
          <div className="flex items-center gap-3 flex-1 max-w-xs">
            <button onClick={() => setMuted(!muted)} className="text-[hsl(var(--tl-text-muted))] hover:text-[hsl(var(--tl-text))]">
              {displayVolume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input 
              type="range" min="0" max="1" step="0.01" 
              value={displayVolume} 
              onChange={(e) => {
                setMasterVolume(parseFloat(e.target.value));
                if (muted) setMuted(false);
              }}
              className="flex-1 h-1.5 rounded-full appearance-none bg-[hsl(var(--tl-border))] outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--tl-text))] cursor-pointer"
              style={{ backgroundImage: `linear-gradient(to right, hsl(var(--tl-text)) ${displayVolume * 100}%, transparent ${displayVolume * 100}%)` }}
            />
          </div>

          <div className="h-8 w-px bg-[hsl(var(--tl-border))] hidden md:block"></div>

          {/* Slim Horizontal Mixer */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 w-32">
               <Music className="w-3.5 h-3.5" style={{ color: 'hsl(var(--tl-music))' }} />
               <span className="text-[10px] font-medium uppercase text-[hsl(var(--tl-text-muted))] w-12">Música</span>
               <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={musicMix} 
                  onChange={(e) => setMusicMix(parseFloat(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none bg-[hsl(var(--tl-border))] outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  style={{ 
                    backgroundImage: `linear-gradient(to right, hsl(var(--tl-music)) ${musicMix * 100}%, transparent ${musicMix * 100}%)`,
                    '--thumb-color': 'hsl(var(--tl-music))' 
                  } as React.CSSProperties}
               />
            </div>
            
            <div className="flex items-center gap-2 w-32">
               <Mic className="w-3.5 h-3.5" style={{ color: 'hsl(var(--tl-jingle))' }} />
               <span className="text-[10px] font-medium uppercase text-[hsl(var(--tl-text-muted))] w-12">Locução</span>
               <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={jingleMix} 
                  onChange={(e) => setJingleMix(parseFloat(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none bg-[hsl(var(--tl-border))] outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  style={{ 
                    backgroundImage: `linear-gradient(to right, hsl(var(--tl-jingle)) ${jingleMix * 100}%, transparent ${jingleMix * 100}%)`,
                    '--thumb-color': 'hsl(var(--tl-jingle))' 
                  } as React.CSSProperties}
               />
            </div>
          </div>
          
        </div>
      </footer>
      
      {/* Inline styles for range thumbs that need CSS vars */}
      <style dangerouslySetInnerHTML={{__html: `
        input[type=range]::-webkit-slider-thumb {
          background-color: var(--thumb-color, currentColor);
        }
      `}} />
    </div>
  );
}
