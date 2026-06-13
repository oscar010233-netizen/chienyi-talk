import { WeakPhoneme } from '@/types/result';

function adviceForPhoneme(phoneme: string): string {
  const normalized = phoneme.toLowerCase();

  if (['θ', 'ð'].includes(normalized)) {
    return '舌尖輕放上下齒之間，先吐氣再發聲，避免唸成 s 或 d。';
  }

  if (['r', 'ɹ'].includes(normalized)) {
    return '舌尖不要碰上顎，嘴唇微收，讓聲音從喉嚨往前送。';
  }

  if (['ɪ', 'i', 'iː'].includes(normalized)) {
    return '把短音和長音分開練：短音嘴型放鬆，長音拉長並保持穩定。';
  }

  if (['æ', 'ɛ', 'e'].includes(normalized)) {
    return '嘴巴打開一些，先慢慢拉出母音，再接回完整單字。';
  }

  if (['p', 'b', 't', 'd', 'k', 'g'].includes(normalized)) {
    return '先練爆破音的收放，停半拍後清楚吐出氣流。';
  }

  return '把這個音素單獨唸 3 次，再放回例字中用慢速練一次。';
}

interface PracticeAdviceProps {
  phonemes: WeakPhoneme[];
}

export function PracticeAdvice({ phonemes }: PracticeAdviceProps) {
  if (phonemes.length === 0) return null;

  return (
    <div className="mt-3 rounded-2xl bg-orange-50 p-4">
      <p className="text-sm font-semibold text-[#e4524f]">建議練習方式</p>
      <div className="mt-3 flex flex-col gap-2">
        {phonemes.slice(0, 3).map((ph) => (
          <p key={ph.phoneme} className="text-sm leading-6 text-zinc-700">
            <span className="font-semibold text-foreground">/{ph.phoneme}/</span>
            {' '}
            {adviceForPhoneme(ph.phoneme)}
          </p>
        ))}
      </div>
    </div>
  );
}
