'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ScoreLegend } from '@/components/ScoreLegend';
import { ScoreCard } from '@/components/speaking/ScoreCard';
import { PhonemeList } from '@/components/speaking/PhonemeList';
import { PracticeAdvice } from '@/components/speaking/PracticeAdvice';
import { WordPhonemeBreakdown } from '@/components/speaking/WordPhonemeBreakdown';
import { AssessmentResult, ASSESSMENT_STORAGE_KEY } from '@/hooks/usePronunciationAssessment';
import { WeakPhoneme } from '@/types/result';

interface ResultClientProps {
  bookId: string;
}

function extractWeakPhonemes(result: AssessmentResult): WeakPhoneme[] {
  const phonemeMap: Record<string, { totalScore: number; count: number; exampleWord: string }> = {};

  for (const word of result.words) {
    for (const ph of word.phonemes) {
      if (!phonemeMap[ph.phoneme]) {
        phonemeMap[ph.phoneme] = { totalScore: 0, count: 0, exampleWord: word.word };
      }
      phonemeMap[ph.phoneme].totalScore += ph.accuracyScore;
      phonemeMap[ph.phoneme].count += 1;
    }
  }

  return Object.entries(phonemeMap)
    .map(([phoneme, { totalScore, count, exampleWord }]) => ({
      phoneme,
      exampleWord,
      accuracyScore: Math.round(totalScore / count),
    }))
    .filter((ph) => ph.accuracyScore < 70)
    .sort((a, b) => a.accuracyScore - b.accuracyScore)
    .slice(0, 5);
}

function greetingText(score: number) {
  if (score >= 85) return { emoji: '🌟', title: 'EXCELLENT!', sub: '發音非常標準，繼續保持！' };
  if (score >= 70) return { emoji: '🎉', title: 'WELL DONE!', sub: '繼續練習，發音越來越棒！' };
  if (score >= 50) return { emoji: '💪', title: 'KEEP GOING!', sub: '多練幾次就能進步！' };
  return { emoji: '📚', title: 'MORE PRACTICE!', sub: '找出弱點，針對練習！' };
}

function readStoredAssessmentSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ASSESSMENT_STORAGE_KEY);
}

function parseAssessmentSnapshot(stored: string | null): AssessmentResult | null {
  if (!stored) return null;

  try {
    return JSON.parse(stored) as AssessmentResult;
  } catch {
    return null;
  }
}

function subscribeToAssessmentStorage(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
}

export function ResultClient({ bookId }: ResultClientProps) {
  const stored = useSyncExternalStore(
    subscribeToAssessmentStorage,
    readStoredAssessmentSnapshot,
    () => null
  );
  const result = parseAssessmentSnapshot(stored);

  if (!result) {
    return (
      <div className="flex flex-col gap-8 p-6 max-w-2xl mx-auto">
        <div className="flex flex-col items-center gap-3 py-8 bg-yellow-50 rounded-3xl">
          <div className="text-6xl" aria-hidden>📊</div>
          <h1 className="text-xl font-bold text-foreground">尚無評分資料</h1>
          <p className="text-sm text-muted-foreground">請先完成一次練習</p>
        </div>
        <Link
          href={`/speaking/${bookId}/practice`}
          className="flex items-center justify-center w-full py-3.5 rounded-xl bg-gold text-white font-semibold text-base hover:bg-gold/90 transition-colors"
        >
          開始練習
        </Link>
      </div>
    );
  }

  const weakPhonemes = extractWeakPhonemes(result);
  const { emoji, title, sub } = greetingText(result.pronunciationScore);

  return (
    <div className="flex flex-col gap-8 p-6 max-w-2xl mx-auto">
      <div className="flex flex-col items-center gap-3 py-8 bg-yellow-50 rounded-3xl">
        <div className="text-6xl" aria-hidden>{emoji}</div>
        <h1 className="text-2xl font-bold text-foreground tracking-wide">{title}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>

      <section aria-labelledby="scores-heading">
        <h2 id="scores-heading" className="text-base font-semibold text-foreground mb-3">
          本次成績
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ScoreCard label="準確度" score={result.accuracyScore} />
          <ScoreCard label="流利度" score={result.fluencyScore} />
          <ScoreCard label="完整度" score={result.completenessScore} />
          <ScoreCard label="綜合分數" score={result.pronunciationScore} />
        </div>
      </section>

      <ScoreLegend />

      {result.words.length > 0 && (
        <section aria-labelledby="words-heading">
          <h2 id="words-heading" className="text-base font-semibold text-foreground mb-3">
            逐字分析
          </h2>
          <WordPhonemeBreakdown words={result.words} />
        </section>
      )}

      {weakPhonemes.length > 0 && (
        <section aria-labelledby="more-practice-heading">
          <div className="flex items-center justify-between mb-3">
            <h2 id="more-practice-heading" className="text-base font-semibold text-foreground">
              More Practice
            </h2>
            <span className="text-xs text-[#e4524f] font-medium">需加強發音</span>
          </div>
          <PhonemeList phonemes={weakPhonemes} />
          <PracticeAdvice phonemes={weakPhonemes} />
        </section>
      )}

      <div className="flex flex-col gap-3">
        <Link
          href={`/speaking/${bookId}/practice`}
          className="flex items-center justify-center w-full py-3 rounded-xl border border-gold text-gold font-semibold text-base hover:bg-gold/5 transition-colors"
        >
          再練習一次
        </Link>
        <Link
          href="/speaking"
          className="flex items-center justify-center w-full py-3 rounded-xl bg-gold text-white font-semibold text-base hover:bg-gold/90 transition-colors"
        >
          練習其他課程
        </Link>
      </div>
    </div>
  );
}
