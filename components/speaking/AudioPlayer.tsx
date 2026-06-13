'use client';

import { useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  duration?: number;
  className?: string;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function AudioPlayer({ duration = 3, className }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);

  const nextSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const formatTime = (pct: number) => {
    const secs = Math.round((pct / 100) * duration);
    return `0:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3',
        className
      )}
    >
      {/* Play / Pause */}
      <button
        aria-label={playing ? '暫停' : '播放範例音訊'}
        onClick={() => setPlaying(!playing)}
        className="w-9 h-9 rounded-full bg-gold flex items-center justify-center shrink-0 hover:bg-gold/90 transition-colors"
      >
        {playing ? (
          <Pause size={16} className="text-white" />
        ) : (
          <Play size={16} className="text-white ml-0.5" />
        )}
      </button>

      {/* Progress */}
      <div className="flex-1">
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          aria-label="播放進度"
          className="w-full h-1.5 accent-[#F5A623] cursor-pointer"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
          <span>{formatTime(progress)}</span>
          <span>0:{String(duration).padStart(2, '0')}</span>
        </div>
      </div>

      {/* Volume */}
      <button
        aria-label={muted ? '取消靜音' : '靜音'}
        onClick={() => setMuted(!muted)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Speed */}
      <button
        aria-label={`播放速度 ${speed} 倍，點擊切換`}
        onClick={nextSpeed}
        className="text-xs font-semibold text-gold bg-gold/10 rounded px-1.5 py-0.5 hover:bg-gold/20 transition-colors shrink-0"
      >
        {speed}x
      </button>
    </div>
  );
}
