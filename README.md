# ChienYi Talk / JianYi OS

Next.js 16 App Router project for JianYi internal tools:

- English speaking practice with Azure Speech Pronunciation Assessment.
- Workspace schedule view.
- Exam answer-sheet grading with Gemini.

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Azure Speech Setup

Create `.env.local`:

```bash
AZURE_SPEECH_KEY=your_speech_resource_key
AZURE_SPEECH_REGION=eastasia
AZURE_SPEECH_ENDPOINT=https://your-resource-name.cognitiveservices.azure.com
AZURE_FOUNDRY_PROJECT_ENDPOINT=
AZURE_SPEECH_ENGINE=auto
AZURE_SPEECH_MOCK=false

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

Notes:

- Traditional 32-character Speech keys can use `AZURE_SPEECH_REGION`.
- Newer Foundry / Azure AI Services setups should use `AZURE_SPEECH_ENDPOINT`
  or `AZURE_FOUNDRY_PROJECT_ENDPOINT`.
- The endpoint must be from the same Azure Speech resource as the key.
- Set `AZURE_SPEECH_MOCK=true` to test the UI flow without calling Azure.

## Main Routes

- `/` - dashboard
- `/workspace` - workspace schedule
- `/speaking` - book list
- `/speaking/[bookId]/practice` - recording practice
- `/speaking/[bookId]/result` - score result
- `/exam-grading` - answer-sheet grading
- `/api/pronunciation-assessment` - server-side Azure REST call
- `/api/grade` - server-side Gemini answer-sheet reader

## Verify

```bash
npm run lint
npm run build
```
