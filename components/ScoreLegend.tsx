const legendItems = [
  { color: 'bg-red-500', label: '需要練習', range: '< 50' },
  { color: 'bg-yellow-400', label: '尚可', range: '50-79' },
  { color: 'bg-[#27AE60]', label: '正確', range: '80+' },
  { color: 'border border-dashed border-zinc-400 bg-white', label: '漏念', range: 'Omission' },
  { color: 'bg-[#E85D24]', label: '多念', range: 'Insertion' },
];

export function ScoreLegend() {
  return (
    <div className="rounded-2xl bg-[#F8F8F8] p-4">
      <p className="text-sm font-semibold text-foreground">顏色圖例</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`h-3 w-3 shrink-0 rounded-full ${item.color}`} aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{item.label}</span>
              <span>{item.range}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
