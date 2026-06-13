import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ANSWER_KEY = "AABBCDBDCA".split("");
const ACCEPTED_ANSWERS = new Set(["A", "B", "C", "D"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type GeminiAnswer = {
  question?: number;
  answer?: string | null;
  status?: string;
  confidence?: number | null;
};

type GeminiPayload = {
  answers?: GeminiAnswer[];
  notes?: string;
};

type RawGeminiPayload = GeminiPayload &
  GeminiAnswer & {
    [key: string]: unknown;
  };

function normalizeAnswer(answer: unknown) {
  if (typeof answer !== "string") return null;
  const normalized = answer.trim().toUpperCase();
  return ACCEPTED_ANSWERS.has(normalized) ? normalized : null;
}

function clampConfidence(confidence: unknown) {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return null;
  return Math.max(0, Math.min(1, confidence));
}

function extractFirstJsonValue(text: string) {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!starts.length) return null;

  const start = Math.min(...starts);
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;

    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }

  return null;
}

function normalizeGeminiPayload(payload: unknown): GeminiPayload {
  if (Array.isArray(payload)) {
    return { answers: payload as GeminiAnswer[] };
  }

  if (!payload || typeof payload !== "object") {
    return {};
  }

  const rawPayload = payload as RawGeminiPayload;

  if (Array.isArray(rawPayload.answers)) {
    return {
      answers: rawPayload.answers,
      notes: typeof rawPayload.notes === "string" ? rawPayload.notes : undefined,
    };
  }

  if ("question" in rawPayload || "answer" in rawPayload) {
    return {
      answers: [rawPayload],
      notes: typeof rawPayload.notes === "string" ? rawPayload.notes : undefined,
    };
  }

  const mappedAnswers = Object.entries(rawPayload).reduce<GeminiAnswer[]>(
    (answers, [key, value]) => {
      const question = Number(key.replace(/\D/g, ""));
      if (
        !Number.isInteger(question) ||
        question < 1 ||
        question > ANSWER_KEY.length
      ) {
        return answers;
      }

      if (typeof value === "string" || value === null) {
        answers.push({
          question,
          answer: value,
          status: value ? "detected" : "blank",
          confidence: null,
        });
        return answers;
      }

      if (value && typeof value === "object") {
        answers.push({ question, ...(value as GeminiAnswer) });
      }

      return answers;
    },
    []
  );

  return mappedAnswers.length ? { answers: mappedAnswers } : {};
}

function parseGeminiText(text: string): GeminiPayload {
  const trimmed = text.trim();
  if (!trimmed) return {};

  try {
    return normalizeGeminiPayload(JSON.parse(trimmed));
  } catch {
    const extracted = extractFirstJsonValue(trimmed);
    if (!extracted) return {};
    return normalizeGeminiPayload(JSON.parse(extracted));
  }
}

function gradePayload(payload: GeminiPayload) {
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  const byQuestion = new Map<number, GeminiAnswer>();

  answers.forEach((answer, index) => {
    const question = Number.isInteger(answer.question)
      ? Number(answer.question)
      : index + 1;
    if (question >= 1 && question <= ANSWER_KEY.length) {
      byQuestion.set(question, answer);
    }
  });

  const rows = ANSWER_KEY.map((correctAnswer, index) => {
    const question = index + 1;
    const detected = byQuestion.get(question);
    const detectedAnswer = normalizeAnswer(detected?.answer);
    const status =
      detected?.status?.trim() || (detectedAnswer ? "detected" : "blank");
    const confidence = clampConfidence(detected?.confidence);
    const isCorrect = detectedAnswer === correctAnswer;

    return {
      question,
      correctAnswer,
      detectedAnswer,
      status,
      confidence,
      isCorrect,
    };
  });

  const correctCount = rows.filter((row) => row.isCorrect).length;

  return {
    answerKey: ANSWER_KEY,
    score: correctCount,
    total: ANSWER_KEY.length,
    correctCount,
    rows,
  };
}

function buildResponseSchema() {
  return {
    type: "object",
    properties: {
      answers: {
        type: "array",
        minItems: ANSWER_KEY.length,
        maxItems: ANSWER_KEY.length,
        items: {
          type: "object",
          properties: {
            question: {
              type: "integer",
              minimum: 1,
              maximum: ANSWER_KEY.length,
            },
            answer: {
              type: "string",
              nullable: true,
              enum: ["A", "B", "C", "D"],
            },
            status: {
              type: "string",
              enum: ["detected", "blank", "multiple", "uncertain"],
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
            },
          },
          required: ["question", "answer", "status", "confidence"],
        },
      },
      notes: {
        type: "string",
      },
    },
    required: ["answers", "notes"],
  };
}

function buildPrompt() {
  return [
    "You are an answer-sheet reader. Read the student's marked answers only; do not grade.",
    "The image may show a Taiwanese answer card. Focus on questions 1 to 10 only.",
    "If the upload is a screenshot of a web app, first locate the photo of the paper answer card inside the screenshot and ignore all app UI.",
    "For this MVP, read the left vertical question group numbered 1, 2, 3, ... 10. Ignore the right-side group such as 26, 27, 28, etc.",
    "Each question has four small rectangular boxes labeled A, B, C, D. The filled or darkest box is the selected answer.",
    "For each row, interpret the four answer boxes from left to right as A, B, C, D. Use this order even if the printed letters are skewed by perspective.",
    "Ignore instructions, examples, headers, answer-card sample boxes, and questions outside 1 to 10.",
    "Return exactly 10 answer objects in the answers array, one object for each question 1 through 10.",
    "For each question, choose the visibly filled or darkest option among A, B, C, D.",
    "If a row is visible and one box is clearly darker than the others, mark it as detected even if the photo is tilted.",
    "Use answer null only when the row is truly unreadable, blank, or has multiple filled boxes.",
    "Do not infer from the answer key. Do not skip any question. Output JSON only.",
  ].join("\n");
}

async function callGemini({
  apiKey,
  base64,
  mimeType,
  model,
  useSchema,
}: {
  apiKey: string;
  base64: string;
  mimeType: string;
  model: string;
  useSchema: boolean;
}) {
  const generationConfig = useSchema
    ? {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: buildResponseSchema(),
      }
    : {
        temperature: 0,
        responseMimeType: "application/json",
      };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildPrompt() },
              {
                inlineData: {
                  mimeType,
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { message: "Please upload an image file." },
        { status: 400 }
      );
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { message: "Only image files are supported." },
        { status: 400 }
      );
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { message: "Image is too large. Use an image under 8MB." },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { message: "Gemini API key is missing. Set GEMINI_API_KEY." },
        { status: 500 }
      );
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const bytes = Buffer.from(await image.arrayBuffer());
    const base64 = bytes.toString("base64");
    const mimeType = image.type || "image/jpeg";

    let { response, data } = await callGemini({
      apiKey,
      base64,
      mimeType,
      model,
      useSchema: true,
    });

    if (!response.ok && response.status === 400) {
      ({ response, data } = await callGemini({
        apiKey,
        base64,
        mimeType,
        model,
        useSchema: false,
      }));
    }

    if (!response.ok) {
      const apiMessage = data?.error?.message ? ` ${data.error.message}` : "";
      return NextResponse.json(
        { message: `Gemini API failed.${apiMessage}` },
        { status: response.status || 502 }
      );
    }

    const rawText =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("") ?? "";

    const extracted = parseGeminiText(rawText);
    const graded = gradePayload(extracted);

    return NextResponse.json({
      ...graded,
      extracted,
      notes: extracted.notes ?? null,
      rawText,
      model,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Grading failed. Please try again.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
