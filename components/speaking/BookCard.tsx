'use client';

import Link from 'next/link';
import { Book } from '@/types/book';

interface BookCardProps {
  book: Book;
}

export function BookCard({ book }: BookCardProps) {
  return (
    <div className="group rounded-2xl overflow-hidden bg-white ring-1 ring-foreground/10 hover:shadow-md transition-shadow">
      <Link href={`/speaking/${book.id}/practice`} aria-label={`開始練習 ${book.title}`}>
        <div
          className="relative aspect-[3/4] w-full flex items-center justify-center"
          style={{ backgroundColor: book.coverColor }}
        >
          <span className="text-white/90 text-base font-bold text-center px-4 leading-tight">
            {book.title}
          </span>
        </div>
        <div className="p-3">
          <p className="font-semibold text-sm leading-snug line-clamp-2 text-foreground">
            {book.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{book.series}</p>
        </div>
      </Link>
    </div>
  );
}
