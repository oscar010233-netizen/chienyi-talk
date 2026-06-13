import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SHORT_AUDIO_PATH = '/stt/speech/recognition/conversation/cognitiveservices/v1';
const LEGACY_SHORT_AUDIO_PATH = '/speech/recognition/conversation/cognitiveservices/v1';

type AzurePronunciationScores = {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  ProsodyScore?: number;
  PronScore?: number;
};

type AzurePhoneme = {
  Phoneme?: string;
  AccuracyScore?: number;
  Offset?: number;
  Duration?: number;
  PronunciationAssessment?: Pick<AzurePronunciationScores, 'AccuracyScore'>;
};

type AzureWord = {
  Word?: string;
  AccuracyScore?: number;
  ErrorType?: string;
  PronunciationAssessment?: Pick<AzurePronunciationScores, 'AccuracyScore'> & {
    ErrorType?: string;
  };
  Phonemes?: AzurePhoneme[];
};

type AzureNBest = AzurePronunciationScores & {
  PronunciationAssessment?: AzurePronunciationScores;
  Words?: AzureWord[];
};

type AzureSpeechResponse = {
  RecognitionStatus?: string;
  NBest?: AzureNBest[];
};

type AssessmentResult = {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  prosodyScore?: number;
  words: Array<{
    word: string;
    accuracyScore: number;
    errorType: string;
    phonemes: Array<{
      phoneme: string;
      accuracyScore: number;
      offset?: number;
      duration?: number;
    }>;
  }>;
};

class AssessmentRequestError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AssessmentRequestError';
    this.status = status;
  }
}

function mockAssessmentResult(referenceText: string): AssessmentResult {
  const word = referenceText.trim() || 'Greeting';

  return {
    accuracyScore: 82,
    fluencyScore: 76,
    completenessScore: 90,
    prosodyScore: 79,
    pronunciationScore: 81,
    words: [
      {
        word,
        accuracyScore: 82,
        errorType: 'None',
        phonemes: [
          { phoneme: 'ɡ', accuracyScore: 92, offset: 0, duration: 1200000 },
          { phoneme: 'r', accuracyScore: 78, offset: 1200000, duration: 900000 },
          { phoneme: 'iː', accuracyScore: 88, offset: 2100000, duration: 1100000 },
          { phoneme: 't', accuracyScore: 69, offset: 3200000, duration: 600000 },
          { phoneme: 'ɪ', accuracyScore: 48, offset: 3800000, duration: 900000 },
          { phoneme: 'ŋ', accuracyScore: 74, offset: 4700000, duration: 1000000 },
        ],
      },
    ],
  };
}

function toBase64(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64');
}

function normalizeEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) return undefined;

  const url = new URL(endpoint.trim());
  url.search = '';
  url.hash = '';

  if (url.pathname.includes('/api/projects/')) {
    url.pathname = '';
  }

  return url.toString().replace(/\/+$/, '');
}

function buildSpeechUrl(region: string, endpoint?: string): string {
  const params = new URLSearchParams({ language: 'en-US', format: 'detailed' });

  if (!endpoint) {
    return `https://${region}.stt.speech.microsoft.com${LEGACY_SHORT_AUDIO_PATH}?${params}`;
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!normalizedEndpoint) {
    return `https://${region}.stt.speech.microsoft.com${LEGACY_SHORT_AUDIO_PATH}?${params}`;
  }

  if (normalizedEndpoint.includes('/speech/recognition/')) {
    const url = new URL(normalizedEndpoint);
    url.searchParams.set('language', 'en-US');
    url.searchParams.set('format', 'detailed');
    return url.toString();
  }

  const path = normalizedEndpoint.includes('.stt.speech.microsoft.com')
    ? LEGACY_SHORT_AUDIO_PATH
    : SHORT_AUDIO_PATH;

  return `${normalizedEndpoint}${path}?${params}`;
}

function roundScore(value: number | undefined): number {
  return Math.round(value ?? 0);
}

function normalizeAzureResponse(data: AzureSpeechResponse): AssessmentResult {
  const nbest = data.NBest?.[0];
  const scores = nbest?.PronunciationAssessment ?? nbest;

  if (!nbest || scores?.PronScore === undefined) {
    throw new Error(
      `Azure 未回傳可用的發音評分結果。RecognitionStatus: ${data.RecognitionStatus ?? 'Unknown'}`
    );
  }

  return {
    accuracyScore: roundScore(scores.AccuracyScore),
    fluencyScore: roundScore(scores.FluencyScore),
    completenessScore: roundScore(scores.CompletenessScore),
    prosodyScore: scores.ProsodyScore === undefined ? undefined : roundScore(scores.ProsodyScore),
    pronunciationScore: roundScore(scores.PronScore),
    words: (nbest.Words ?? []).map((word) => ({
      word: word.Word ?? '',
      accuracyScore: roundScore(word.PronunciationAssessment?.AccuracyScore ?? word.AccuracyScore),
      errorType: word.PronunciationAssessment?.ErrorType ?? word.ErrorType ?? 'None',
      phonemes: (word.Phonemes ?? []).map((phoneme) => ({
        phoneme: phoneme.Phoneme ?? '',
        accuracyScore: roundScore(
          phoneme.PronunciationAssessment?.AccuracyScore ?? phoneme.AccuracyScore
        ),
        offset: phoneme.Offset,
        duration: phoneme.Duration,
      })),
    })),
  };
}

function stripWavHeaderIfPresent(audioBuffer: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(audioBuffer);
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const wave = String.fromCharCode(...bytes.slice(8, 12));

  if (riff !== 'RIFF' || wave !== 'WAVE') return bytes;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const chunkSize = new DataView(audioBuffer, offset + 4, 4).getUint32(0, true);
    const dataStart = offset + 8;

    if (chunkId === 'data') {
      return bytes.slice(dataStart, dataStart + chunkSize);
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  return bytes.length > 44 ? bytes.slice(44) : bytes;
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function closeSafely(resourceName: string, closeFn: () => void) {
  try {
    closeFn();
  } catch (err) {
    console.warn(
      `${resourceName} cleanup failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function assessWithSpeechSdk(
  audioBuffer: ArrayBuffer,
  referenceText: string,
  key: string,
  endpoint: string
): Promise<AssessmentResult> {
  const sdk = await import('microsoft-cognitiveservices-speech-sdk');
  const normalizedEndpoint = normalizeEndpoint(endpoint);

  if (!normalizedEndpoint) {
    throw new Error('Speech SDK 需要 AZURE_SPEECH_ENDPOINT 或 AZURE_FOUNDRY_PROJECT_ENDPOINT。');
  }

  const format = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
  const pushStream = sdk.AudioInputStream.createPushStream(format);
  pushStream.write(toExactArrayBuffer(stripWavHeaderIfPresent(audioBuffer)));
  pushStream.close();

  const speechConfig = sdk.SpeechConfig.fromEndpoint(new URL(normalizedEndpoint), key);
  speechConfig.speechRecognitionLanguage = 'en-US';

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
    referenceText.trim(),
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    true
  );
  pronunciationConfig.phonemeAlphabet = 'IPA';
  pronunciationConfig.nbestPhonemeCount = 5;
  pronunciationConfig.enableProsodyAssessment = true;

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  pronunciationConfig.applyTo(recognizer);

  try {
    const speechResult = await new Promise<InstanceType<typeof sdk.SpeechRecognitionResult>>(
      (resolve, reject) => {
        recognizer.recognizeOnceAsync(resolve, reject);
      }
    );

    const jsonResult = speechResult.properties.getProperty(
      sdk.PropertyId.SpeechServiceResponse_JsonResult
    );

    if (!jsonResult) {
      const cancellation = sdk.CancellationDetails.fromResult(speechResult);
      throw new Error(
        cancellation?.errorDetails ||
          speechResult.errorDetails ||
          `Speech SDK 未回傳評分 JSON。Reason: ${speechResult.reason}`
      );
    }

    return normalizeAzureResponse(JSON.parse(jsonResult) as AzureSpeechResponse);
  } finally {
    closeSafely('Speech recognizer', () => recognizer.close());
    closeSafely('Push audio stream', () => pushStream.close());
    closeSafely('Speech config', () => speechConfig.close());
  }
}

async function assessWithRest(
  audioBuffer: ArrayBuffer,
  referenceText: string,
  key: string,
  region: string,
  endpoint?: string
): Promise<AssessmentResult> {
  const config = toBase64(
    JSON.stringify({
      ReferenceText: referenceText.trim(),
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      EnableMiscue: true,
      EnableProsodyAssessment: true,
      phonemeAlphabet: 'IPA',
      nBestPhonemeCount: 5,
    })
  );

  const speechUrl = buildSpeechUrl(region, endpoint);
  const targetHost = new URL(speechUrl).host;

  const azureRes = await fetch(speechUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Pronunciation-Assessment': config,
    },
    body: audioBuffer,
  });

  if (!azureRes.ok) {
    const msg = await azureRes.text();
    if (azureRes.status === 429) {
      const retryAfter = azureRes.headers.get('Retry-After') ?? '30';
      throw new AssessmentRequestError(
        `Azure 免費 F0 層級目前被限流，請等 ${retryAfter} 秒後再試。若要連續快速練習，需要升級 Speech Services pricing tier。`,
        429
      );
    }

    throw new AssessmentRequestError(
      `REST ${azureRes.status} (${targetHost}): ${
        msg || '請確認 key、region 與 endpoint 是否屬於同一個 Speech 資源。'
      }`,
      azureRes.status
    );
  }

  return normalizeAzureResponse((await azureRes.json()) as AzureSpeechResponse);
}

export async function POST(request: NextRequest) {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim() || 'eastasia';
  const endpoint =
    process.env.AZURE_SPEECH_ENDPOINT?.trim() ||
    process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT?.trim();
  const engine = process.env.AZURE_SPEECH_ENGINE?.trim() || 'auto';
  const mockMode = process.env.AZURE_SPEECH_MOCK === 'true';

  const formData = await request.formData();
  const audioFile = formData.get('audio') as File | null;
  const referenceText = formData.get('referenceText') as string | null;

  if (!audioFile || !referenceText) {
    return NextResponse.json(
      { error: '缺少 audio 或 referenceText。' },
      { status: 400 }
    );
  }

  if (mockMode || !key) {
    return NextResponse.json(mockAssessmentResult(referenceText));
  }

  if (!endpoint && key.length > 40) {
    return NextResponse.json(
      {
        error:
          '目前使用的是新版長格式 Azure key，請在 .env.local 補上 AZURE_SPEECH_ENDPOINT 或 AZURE_FOUNDRY_PROJECT_ENDPOINT。',
      },
      { status: 500 }
    );
  }

  const audioBuffer = await audioFile.arrayBuffer();
  const errors: string[] = [];

  if (endpoint && engine !== 'rest') {
    try {
      const result = await assessWithSpeechSdk(audioBuffer, referenceText, key, endpoint);
      return NextResponse.json(result);
    } catch (err) {
      errors.push(`SDK: ${err instanceof Error ? err.message : String(err)}`);
      if (engine === 'sdk') {
        return NextResponse.json({ error: errors.join(' | ') }, { status: 502 });
      }
    }
  }

  try {
    const result = await assessWithRest(audioBuffer, referenceText, key, region, endpoint);
    return NextResponse.json(result);
  } catch (err) {
    errors.push(`REST: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof AssessmentRequestError && err.status === 429) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
  }

  return NextResponse.json(
    {
      error: errors.join(' | '),
    },
    { status: 502 }
  );
}
