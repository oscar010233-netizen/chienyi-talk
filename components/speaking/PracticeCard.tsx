import { PracticeWord } from '@/types/book';

interface PracticeCardProps {
  word: PracticeWord;
  coverColor: string;
  bookTitle: string;
}

export function PracticeCard({ word, coverColor, bookTitle }: PracticeCardProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Book cover thumbnail */}
      <div
        className="w-20 h-28 rounded-xl flex items-center justify-center shadow-md"
        style={{ backgroundColor: coverColor }}
        role="img"
        aria-label={`${bookTitle} 封面`}
      >
        <span className="text-white/90 text-xs font-bold text-center px-2 leading-tight">
          {bookTitle}
        </span>
      </div>

      {/* Word content */}
      <div className="text-center">
        <p className="text-4xl font-bold text-foreground tracking-wide">{word.english}</p>
        <p className="mt-2 text-lg text-muted-foreground">{word.chinese}</p>
      </div>
    </div>
  );
}
