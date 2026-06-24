// Ported from the legacy Apps Script `06_AIComment.gs > polishParentComment`.
// Polishes a teacher's raw comment into parent-facing text via Gemini.
// The prompt is the proven artifact from the Google system — keep it as the
// single source of truth for tone/length rules.

const POLISH_PROMPT = `你是一位台灣補習班老師，請將以下老師原始評論潤飾成適合傳給家長的文字。

規則：
1. 只輸出一個版本
2. 不要列選項
3. 不要解釋潤飾重點
4. 語氣溫暖、專業、自然
5. 長度控制在 80 字以內
6. 不要太浮誇
7. 不要使用「親愛的家長您好」
8. 保留老師原本想表達的重點，不要自行加入太多不存在的資訊

老師原始評論：
`

export async function polishParentComment(rawComment: string): Promise<string> {
  const raw = rawComment.trim()
  if (!raw) throw new Error('原始評論是空的，無法潤稿')

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('找不到 GEMINI_API_KEY，請先設定環境變數')

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

  // Gemini occasionally returns 503 (overloaded) / 429 (rate limit) on demand
  // spikes. These are transient — retry with exponential backoff before giving up.
  const RETRY_STATUS = new Set([429, 500, 503])
  const MAX_ATTEMPTS = 5

  let lastError = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: POLISH_PROMPT + raw }],
            },
          ],
        }),
      },
    )

    const data = (await response.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      error?: { message?: string }
    }

    if (response.ok) {
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      if (!result) throw new Error('Gemini 沒有回傳潤稿結果')
      return result
    }

    lastError = data.error?.message || `Gemini 回應失敗（${response.status}）`

    if (!RETRY_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
      if (RETRY_STATUS.has(response.status)) {
        throw new Error('Gemini 暫時忙線（伺服器過載），已自動重試仍失敗，請稍候再試一次')
      }
      throw new Error(lastError)
    }

    // backoff: 0.7s, 1.4s, 2.1s, 2.8s — rides through intermittent 503 spikes
    await new Promise((resolve) => setTimeout(resolve, 700 * attempt))
  }

  throw new Error(lastError || '潤色失敗')
}
