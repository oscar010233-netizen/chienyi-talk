import { WeakPhoneme } from '@/types/result';
import { cn } from '@/lib/utils';

interface PhonemeListProps {
  phonemes: WeakPhoneme[];
}

function scoreStyle(score: number) {
  if (score >= 80) return 'text-[#4AB54A] bg-[#4AB54A]/10';
  if (score >= 50) return 'text-yellow-600 bg-yellow-50';
  return 'text-[#e4524f] bg-[#e4524f]/10';
}

export function PhonemeList({ phonemes }: PhonemeListProps) {
  if (phonemes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {phonemes.map((ph) => (
        <div
          key={ph.phoneme}
          className="flex items-center gap-4 rounded-xl bg-[#f2f3f5] p-3"
        >
          {/* Phoneme symbol */}
          <div
            className={cn(
              'w-12 h-12 rounded-lg flex items-center justify-center text-base font-bold shrink-0',
              scoreStyle(ph.accuracyScore)
            )}
            aria-label={`音素 ${ph.phoneme}`}
          >
            /{ph.phoneme}/
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              例字：<span className="font-bold italic">{ph.exampleWord}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              準確度 {ph.accuracyScore}%
            </p>
          </div>

          {/* Score badge */}
          <span
            className={cn(
              'shrink-0 text-sm font-semibold',
              scoreStyle(ph.accuracyScore).split(' ')[0]
            )}
          >
            {ph.accuracyScore}
          </span>
        </div>
      ))}
    </div>
  );
}
