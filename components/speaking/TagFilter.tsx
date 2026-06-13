'use client';

import { Tag } from '@/types/book';
import { cn } from '@/lib/utils';

interface TagFilterProps {
  tags: Tag[];
  activeTag: string;
  onTagChange: (tagId: string) => void;
}

export function TagFilter({ tags, activeTag, onTagChange }: TagFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => onTagChange(tag.id)}
          aria-pressed={activeTag === tag.id}
          className={cn(
            'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
            activeTag === tag.id
              ? 'bg-gold text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/70'
          )}
        >
          {tag.label}
        </button>
      ))}
    </div>
  );
}
