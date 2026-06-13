import fs from 'node:fs';

const SHORT_AUDIO_PATH = '/stt/speech/recognition/conversation/cognitiveservices/v1';
const LEGACY_SHORT_AUDIO_PATH = '/speech/recognition/conversation/cognitiveservices/v1';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return {};

  const env = {};
  for (const rawLine of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;

    const [name, ...rest] = line.split('=');
    env[name.trim()] = rest.join('=').trim();
  }
  return env;
}

function buildSpeechUrl(region, endpoint) {
  const params = new URLSearchParams({ language: 'en-US', format: 'detailed' });

  if (!endpoint) {
    return `https://${region}.stt.speech.microsoft.com${LEGACY_SHORT_AUDIO_PATH}?${params}`;
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);
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

function normalizeEndpoint(endpoint) {
  const url = new URL(endpoint.trim());
  url.search = '';
  url.hash = '';

  if (url.pathname.includes('/api/projects/')) {
    url.pathname = '';
  }

  return url.toString().replace(/\/+$/, '');
}

function wavSilence(seconds = 1, sampleRate = 16000) {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  let offset = 0;

  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(36 + samples * 2, offset); offset += 4;
  buffer.write('WAVEfmt ', offset); offset += 8;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(sampleRate * 2, offset); offset += 4;
  buffer.writeUInt16LE(2, offset); offset += 2;
  buffer.writeUInt16LE(16, offset); offset += 2;
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(samples * 2, offset);

  return buffer;
}

function pronunciationHeader(referenceText) {
  return Buffer.from(JSON.stringify({
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
    phonemeAlphabet: 'IPA',
  }), 'utf8').toString('base64');
}

const env = { ...process.env, ...loadEnvFile('.env.local') };
const key = env.AZURE_SPEECH_KEY?.trim();
const region = env.AZURE_SPEECH_REGION?.trim() || 'eastasia';
const endpoint =
  env.AZURE_SPEECH_ENDPOINT?.trim() ||
  env.AZURE_FOUNDRY_PROJECT_ENDPOINT?.trim();

if (!key) {
  console.error('Missing AZURE_SPEECH_KEY.');
  process.exit(1);
}

if (!endpoint && key.length > 40) {
  console.error('This long-format key needs AZURE_SPEECH_ENDPOINT or AZURE_FOUNDRY_PROJECT_ENDPOINT.');
  console.error('Example: AZURE_SPEECH_ENDPOINT=https://your-resource-name.cognitiveservices.azure.com');
  process.exit(1);
}

const speechUrl = buildSpeechUrl(region, endpoint);
const host = new URL(speechUrl).host;

let res;
try {
  res = await fetch(speechUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Ocp-Apim-Subscription-Key': key,
      'Pronunciation-Assessment': pronunciationHeader('hello'),
    },
    body: wavSilence(),
  });
} catch (err) {
  console.error(JSON.stringify({
    host,
    ok: false,
    note: 'Could not reach Azure Speech endpoint.',
    error: err instanceof Error ? err.message : String(err),
    cause: err?.cause?.code || err?.cause?.message,
  }, null, 2));
  process.exit(1);
}

const body = await res.text();
console.log(JSON.stringify({
  host,
  status: res.status,
  ok: res.ok,
  note: res.ok ? 'Authentication reached Azure Speech.' : 'Azure Speech rejected the request.',
  bodyStart: body.slice(0, 300),
}, null, 2));

if (!res.ok) process.exit(1);
