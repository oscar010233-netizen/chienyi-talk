'use client';

import { useState, useMemo } from 'react';
import { books, tags } from '@/lib/mock/books';
import { BookCard } from '@/components/speaking/BookCard';
import { TagFilter } from '@/components/speaking/TagFilter';
import { SearchBar } from '@/components/speaking/SearchBar';

export default function SpeakingPage() {
  const [activeTag, setActiveTag] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const matchesTag = activeTag === 'all' || book.tags.includes(activeTag);
      const matchesSearch =
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.series.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTag && matchesSearch;
    });
  }, [activeTag, searchQuery]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">口說教材</h1>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          className="w-full sm:w-64"
        />
      </div>

      {/* Tag Filter */}
      <TagFilter tags={tags} activeTag={activeTag} onTagChange={setActiveTag} />

      {/* Book Grid or Empty State */}
      {filteredBooks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="text-5xl" aria-hidden>📚</div>
          <p className="text-base font-medium text-foreground">找不到符合的教材</p>
          <p className="text-sm text-muted-foreground">試試看其他關鍵字或篩選條件</p>
          <button
            onClick={() => {
              setActiveTag('all');
              setSearchQuery('');
            }}
            className="mt-1 text-gold text-sm underline underline-offset-2"
          >
            清除所有篩選
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}
