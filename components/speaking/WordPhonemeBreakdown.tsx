import type { AssessmentResult } from '@/hooks/usePronunciationAssessment';
import { cn } from '@/lib/utils';

type WordAssessment = AssessmentResult['words'][number];

interface WordPhonemeBreakdownProps {
  words: WordAssessment[];
}

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      label: '正確',
      chip: 'border-[#27AE60] bg-[#27AE60]/10 text-[#1D8247]',
      text: 'text-[#27AE60]',
    };
  }

  if (score >= 50) {
    return {
      label: '尚可',
      chip: 'border-yellow-400 bg-yellow-50 text-yellow-700',
      text: 'text-yellow-700',
    };
  }

  return {
    label: '需要練習',
    chip: 'border-red-400 bg-red-50 text-red-600',
    text: 'text-red-600',
  };
}

function wordTone(word: WordAssessment) {
  if (word.errorType === 'Omission') {
    return {
      label: '漏念',
      className: 'border-dashed border-zinc-400 bg-white text-zinc-500',
    };
  }

  if (word.errorType === 'Insertion') {
    return {
      label: '多念',
      className: 'border-[#E85D24] bg-[#E85D24]/10 text-[#E85D24]',
    };
  }

  if (word.errorType === 'Mispronunciation') {
    return {
      label: '發音錯誤',
      className: 'border-zinc-400 bg-zinc-100 text-zinc-700',
    };
  }

  return {
    label: scoreTone(word.accuracyScore).label,
    className: scoreTone(word.accuracyScore).chip,
  };
}

export function WordPhonemeBreakdown({ words }: WordPhonemeBreakdownProps) {
  if (words.length === 0) return null;

  return (
    <div className="space-y-3">
      {words.map((word, wordIndex) => {
        const wordStyle = wordTone(word);

        return (
          <article key={`${word.word}-${wordIndex}`} className="rounded-2xl bg-[#F8F8F8] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-semibold',
                    wordStyle.className
                  )}
                >
                  {word.word || '未辨識'}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {word.accuracyScore}%
                </span>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {wordStyle.label}
              </span>
            </div>

            {word.phonemes.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {word.phonemes.map((phoneme, phonemeIndex) => {
                  const tone = scoreTone(phoneme.accuracyScore);

                  return (
                    <div
                      key={`${word.word}-${phoneme.phoneme}-${phonemeIndex}`}
                      className={cn(
                        'flex h-16 min-w-14 flex-col items-center justify-center rounded-lg border px-2 text-center',
                        tone.chip
                      )}
                      aria-label={`${word.word} 音素 ${phoneme.phoneme}，準確度 ${phoneme.accuracyScore}%`}
                    >
                      <span className="text-base font-bold leading-none">/{phoneme.phoneme}/</span>
                      <span className="mt-1 text-[11px] font-semibold">{phoneme.accuracyScore}%</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">未取得音素資料</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
