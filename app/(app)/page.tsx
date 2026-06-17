import Link from 'next/link';
import { ArrowRight, Mic } from 'lucide-react';
import { books } from '@/lib/mock/books';

export default function Home() {
  const featuredBooks = books.slice(0, 3);

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-6 p-6 pb-nav-safe md:pb-6">
      <section className="rounded-2xl bg-[#fff9f9] p-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-gold/10 px-3 py-1 text-sm font-medium text-gold">
          <Mic size={16} />
          Azure Pronunciation Assessment
        </div>
        <h1 className="mt-5 max-w-2xl text-3xl font-bold leading-tight text-foreground">
          ChienYi Talk 口說練習
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          選擇教材、錄下單字發音，系統會回傳準確度、流利度、完整度與綜合分數，並整理需要加強的音素。
        </p>
        <div className="mt-6">
          <Link
            href="/speaking"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gold/90"
          >
            開始口說練習
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">口說教材</h2>
          <Link href="/speaking" className="text-sm font-medium text-gold">
            查看全部
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {featuredBooks.map((book) => (
            <Link
              key={book.id}
              href={`/speaking/${book.id}/practice`}
              className="group overflow-hidden rounded-2xl bg-white ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              <div
                className="flex aspect-[5/3] items-center justify-center p-4"
                style={{ backgroundColor: book.coverColor }}
              >
                <p className="text-center text-sm font-bold leading-tight text-white">
                  {book.title}
                </p>
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-foreground">{book.series}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
