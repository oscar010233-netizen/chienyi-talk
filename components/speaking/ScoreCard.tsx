import { cn } from '@/lib/utils';

interface ScoreCardProps {
  label: string;
  score: number;
  className?: string;
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-[#4AB54A]';
  if (score >= 50) return 'text-yellow-500';
  return 'text-[#e4524f]';
}

export function ScoreCard({ label, score, className }: ScoreCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 rounded-2xl bg-[#f2f3f5] p-4',
        className
      )}
    >
      <span className={cn('text-3xl font-bold', scoreColor(score))}>{score}</span>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}
