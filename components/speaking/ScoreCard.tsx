import { cn } from '@/lib/utils';

interface ScoreCardProps {
  label: string;
  score: number;
  className?: string;
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-[#27AE60]';
  if (score >= 50) return 'text-yellow-500';
  return 'text-[#E85D24]';
}

export function ScoreCard({ label, score, className }: ScoreCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 rounded-2xl bg-[#F8F8F8] p-4',
        className
      )}
    >
      <span className={cn('text-3xl font-bold', scoreColor(score))}>{score}</span>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}
