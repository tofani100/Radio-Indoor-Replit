import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Sliders, Music, Mic, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./_ambientcard.css";

const LOGO = "/__mockup/images/play-comunique-logo.png";

type MockTrack = {
  id: number;
  title: string;
  artist: string | null;
  type: "music" | "jingle";
  coverUrl?: string | null;
};

const MOCK_QUEUE: MockTrack[] = [
  { id: 1, title: "Weightless", artist: "Marconi Union", type: "music", coverUrl: "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=400&q=80" },
  { id: 2, title: "OFERTA CAFÉ ESPECIAL", artist: "Locução", type: "jingle" },
  { id: 3, title: "Gymnopédie No. 1", artist: "Erik Satie", type: "music", coverUrl: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400&q=80" },
  { id: 4, title: "Clair de Lune", artist: "Claude Debussy", type: "music", coverUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&q=80" },
  { id: 5, title: "OFERTA LIVROS 20%", artist: "Locução", type: "jingle" },
  { id: 6, title: "Avril 14th", artist: "Aphex Twin", type: "music", coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80" },
  { id: 7, title: "Spiegel im Spiegel", artist: "Erik Satie", type: "music", coverUrl: "https://images.unsplash.com/photo-1444464666168-49d633b86797?w=400&q=80" },
  { id: 8, title: "BEM-VINDO À BOUTIQUE", artist: "Locução", type: "jingle" },
];

export function AmbientCard() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(180);
  const [masterVolume, setMasterVolume] = useState(0.5);
  const [musicMix, setMusicMix] = useState(1);
  const [jingleMix, setJingleMix] = useState(0.85);
  const [muted, setMuted] = useState(false);

  const items = MOCK_QUEUE;
  const currentItem = items[currentIdx]!;
  const nextItem = items[(currentIdx + 1) % items.length]!;

  const displayVolume = muted ? 0 : masterVolume;

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((t) => {
          if (t >= duration) {
            setCurrentIdx((i) => (i + 1) % items.length);
            return 0;
          }
          return t + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration, items.length]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(currentItem.type === "jingle" ? 30 : 180 + Math.floor(Math.random() * 60));
  }, [currentIdx, currentItem.type]);

  return (
    <div className="ambient-scope h-screen w-full flex items-center justify-center overflow-hidden p-6">
      
      {/* Brand top right */}
      <div className="absolute top-8 right-10 flex items-center gap-3 opacity-50">
        <span className="text-[10px] tracking-[0.2em] uppercase">Play Comunique</span>
        <img src={LOGO} alt="Play-Comunique" className="w-5 h-5 object-contain" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-md w-full">
        {/* Floating Card */}
        <div className="bg-[var(--ambient-card)] p-12 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] w-full flex flex-col items-center">
          
          {/* Cover */}
          <div className="w-[280px] h-[280px] rounded-3xl overflow-hidden mb-10 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] bg-[#f0f0f0] flex items-center justify-center flex-none">
            {currentItem.coverUrl ? (
              <img src={currentItem.coverUrl} alt="Cover" className="w-full h-full object-cover transition-transform duration-1000 ease-out hover:scale-105" />
            ) : (
              <img src={LOGO} alt="Logo" className="w-24 h-24 object-contain opacity-20" />
            )}
          </div>

          {/* Info */}
          <div className="text-center w-full mb-8">
            <span className="text-[9px] uppercase tracking-[0.3em] text-[var(--ambient-text-muted)] mb-3 block">
              {currentItem.type === "music" ? "Música" : "Locução"}
            </span>
            <h2 className="font-serif text-3xl text-[var(--ambient-text)] mb-2 truncate px-4">
              {currentItem.title}
            </h2>
            <p className="text-sm font-light text-[var(--ambient-text-muted)] truncate px-4">
              {currentItem.artist ?? "–"}
            </p>
          </div>

          {/* Progress */}
          <div className="w-full mb-10">
            <div className="relative group">
              <input
                type="range"
                min={0}
                max={duration}
                step={1}
                value={currentTime}
                onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                className="w-full h-1"
              />
            </div>
            <div className="flex justify-between mt-2 px-1">
              <span className="text-[10px] text-[var(--ambient-text-muted)]">{fmt(currentTime)}</span>
              <span className="text-[10px] text-[var(--ambient-text-muted)]">{fmt(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-8 w-full relative">
            
            {/* Volume */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute left-0 text-[var(--ambient-text-muted)] hover:text-[var(--ambient-text)] transition-colors w-8 h-8 flex items-center justify-center">
                  {muted || masterVolume === 0 ? <VolumeX className="w-4 h-4" strokeWidth={1.5} /> : <Volume2 className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-10 h-32 bg-[var(--ambient-card)] border-[var(--ambient-border)] shadow-lg rounded-full flex flex-col items-center py-4 mb-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={displayVolume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setMasterVolume(v);
                    if (v > 0 && muted) setMuted(false);
                  }}
                  className="w-24 -rotate-90 origin-center absolute top-14"
                />
              </PopoverContent>
            </Popover>

            <button
              onClick={() => setCurrentIdx((i) => (i - 1 + items.length) % items.length)}
              className="text-[var(--ambient-text-muted)] hover:text-[var(--ambient-text)] transition-colors p-2"
            >
              <SkipBack className="w-4 h-4" strokeWidth={1.5} />
            </button>
            
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="w-16 h-16 rounded-full border border-[var(--ambient-border)] flex items-center justify-center text-[var(--ambient-text)] hover:border-[var(--ambient-accent)] hover:text-[var(--ambient-accent)] transition-all duration-300"
            >
              {isPlaying ? <Pause className="w-5 h-5" strokeWidth={1.5} /> : <Play className="w-5 h-5 ml-1" strokeWidth={1.5} />}
            </button>

            <button
              onClick={() => setCurrentIdx((i) => (i + 1) % items.length)}
              className="text-[var(--ambient-text-muted)] hover:text-[var(--ambient-text)] transition-colors p-2"
            >
              <SkipForward className="w-4 h-4" strokeWidth={1.5} />
            </button>

            {/* Mixer Settings */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute right-0 text-[var(--ambient-text-muted)] hover:text-[var(--ambient-text)] transition-colors w-8 h-8 flex items-center justify-center">
                  <Settings className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-64 bg-[var(--ambient-card)] border-[var(--ambient-border)] shadow-xl rounded-2xl p-5 mb-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ambient-text-muted)] mb-5 text-center">Mixer</p>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Music className="w-3.5 h-3.5 text-[var(--ambient-text-muted)] flex-none" />
                    <span className="text-xs text-[var(--ambient-text)] w-14 font-light">Música</span>
                    <input
                      type="range" min={0} max={1} step={0.01}
                      value={musicMix}
                      onChange={(e) => setMusicMix(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Mic className="w-3.5 h-3.5 text-[var(--ambient-text-muted)] flex-none" />
                    <span className="text-xs text-[var(--ambient-text)] w-14 font-light">Locução</span>
                    <input
                      type="range" min={0} max={1} step={0.01}
                      value={jingleMix}
                      onChange={(e) => setJingleMix(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

          </div>
        </div>

        {/* Up Next - minimal */}
        <div className="mt-8 flex flex-col items-center">
          <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--ambient-text-muted)] mb-2">A seguir</p>
          <button 
            className="group flex items-center gap-3 py-2 px-4 rounded-full hover:bg-[rgba(0,0,0,0.02)] transition-colors"
            onClick={() => setCurrentIdx((currentIdx + 1) % items.length)}
          >
            <div className="flex flex-col items-center">
              <span className="text-sm font-medium text-[var(--ambient-text)] group-hover:text-[var(--ambient-accent)] transition-colors">
                {nextItem.title}
              </span>
              <span className="text-xs font-light text-[var(--ambient-text-muted)] mt-0.5">
                {nextItem.artist ?? "–"}
              </span>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
