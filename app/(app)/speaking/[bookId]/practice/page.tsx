import Link from 'next/link';
import { books, practiceWords } from '@/lib/mock/books';
import { PracticeClient } from '@/components/speaking/PracticeClient';

type Props = { params: Promise<{ bookId: string }> };

export default async function PracticePage({ params }: Props) {
  const { bookId } = await params;

  const book = books.find((b) => b.id === bookId);
  const words = practiceWords[bookId] ?? [];

  if (!book || words.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center p-6">
        <div className="text-4xl" aria-hidden>🔍</div>
        <p className="text-muted-foreground">找不到練習內容</p>
        <Link href="/speaking" className="text-gold underline text-sm">
          返回教材列表
        </Link>
      </div>
    );
  }

  return <PracticeClient book={book} words={words} bookId={bookId} />;
}
