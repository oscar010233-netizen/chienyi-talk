'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mic, MicOff, ChevronRight, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { Book, PracticeWord } from '@/types/book';
import { PracticeCard } from '@/components/speaking/PracticeCard';
import { AudioPlayer } from '@/components/speaking/AudioPlayer';
import { ScoreCard } from '@/components/speaking/ScoreCard';
import { WordPhonemeBreakdown } from '@/components/speaking/WordPhonemeBreakdown';
import { usePronunciationAssessment } from '@/hooks/usePronunciationAssessment';
import { cn } from '@/lib/utils';

interface PracticeClientProps {
  book: Book;
  words: PracticeWord[];
  bookId: string;
}

export function PracticeClient({ book, words, bookId }: PracticeClientProps) {
  const [wordIndex, setWordIndex] = useState(0);
  const currentWord = words[wordIndex];

  const { state, result, error, startRecording, stopRecording, reset } =
    usePronunciationAssessment(currentWord.english);

  const handleNext = () => {
    if (wordIndex + 1 < words.length) {
      setWordIndex((i) => i + 1);
      reset();
    }
  };

  const isIdle = state === 'idle';
  const isRecording = state === 'recording';
  const isProcessing = state === 'processing';
  const isDone = state === 'done';
  const isError = state === 'error';

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      {/* Score comparison */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-xl bg-[#F8F8F8] p-4">
          <span className="text-xs text-muted-foreground">最高分</span>
          <span className="text-2xl font-bold text-[#27AE60]">—</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-[#F8F8F8] p-4">
          <span className="text-xs text-muted-foreground">最新分</span>
          <span className="text-2xl font-bold text-foreground">
            {isDone && result ? result.pronunciationScore : '—'}
          </span>
        </div>
      </div>

      {/* Progress badge */}
      <div className="flex justify-center">
        <span className="inline-flex items-center bg-gold text-white text-sm font-semibold px-4 py-1.5 rounded-full">
          {wordIndex + 1} / {words.length}
        </span>
      </div>

      {/* Practice card */}
      <PracticeCard word={currentWord} coverColor={book.coverColor} bookTitle={book.title} />

      {/* Audio player */}
      <AudioPlayer duration={3} />

      {/* Inline scores after recording */}
      {isDone && result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-[#F8F8F8] p-4">
            <p className="text-xs text-muted-foreground mb-3 text-center">本次評分</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ScoreCard label="準確度" score={result.accuracyScore} />
              <ScoreCard label="流利度" score={result.fluencyScore} />
              <ScoreCard label="完整度" score={result.completenessScore} />
              <ScoreCard label="綜合分數" score={result.pronunciationScore} />
            </div>
          </div>

          {result.words.length > 0 && (
            <section aria-labelledby="phoneme-heading" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="phoneme-heading" className="text-base font-semibold text-foreground">
                  音素分析
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
                    需要練習
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" aria-hidden />
                    尚可
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#27AE60]" aria-hidden />
                    正確
                  </span>
                </div>
              </div>
              <WordPhonemeBreakdown words={result.words} />
            </section>
          )}
        </div>
      )}

      {/* Error message */}
      {isError && error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {isDone ? (
          <button
            onClick={reset}
            aria-label="再試一次"
            className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-gold bg-gold/10 text-gold hover:bg-gold/20 transition-colors font-medium"
          >
            <RotateCcw size={28} />
            <span className="text-sm">再試一次</span>
          </button>
        ) : (
          <button
            onClick={isIdle || isError ? startRecording : isRecording ? stopRecording : undefined}
            disabled={isProcessing}
            aria-label={isRecording ? '點擊停止錄音' : isProcessing ? '分析中' : '點擊開始錄音'}
            className={cn(
              'flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 font-medium transition-all',
              isRecording && 'bg-red-50 border-red-400 text-red-500',
              isProcessing && 'bg-muted border-border text-muted-foreground cursor-not-allowed opacity-60',
              (isIdle || isError) && 'bg-gold/10 border-gold text-gold hover:bg-gold/20'
            )}
          >
            {isProcessing ? (
              <Loader2 size={28} className="animate-spin" />
            ) : isRecording ? (
              <MicOff size={28} />
            ) : (
              <Mic size={28} />
            )}
            <span className="text-sm">
              {isRecording ? '點擊停止' : isProcessing ? '分析中...' : isError ? '重試' : '點擊錄音，說出單字'}
            </span>
            {isRecording && (
              <span className="flex gap-1">
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-red-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            )}
          </button>
        )}

        {isDone ? (
          wordIndex + 1 < words.length ? (
            <button
              onClick={handleNext}
              className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
              aria-label="下一題"
            >
              <ChevronRight size={28} />
              <span className="text-sm">下一題</span>
            </button>
          ) : (
            <Link
              href={`/speaking/${bookId}/result`}
              className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl bg-gold text-white hover:bg-gold/90 transition-colors font-medium"
              aria-label="查看完整結果"
            >
              <ChevronRight size={28} />
              <span className="text-sm">查看結果</span>
            </Link>
          )
        ) : (
          <Link
            href={`/speaking/${bookId}/result`}
            className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
            aria-label="跳過"
          >
            <ChevronRight size={28} />
            <span className="text-sm">跳過</span>
          </Link>
        )}
      </div>
    </div>
  );
}
