"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  ClipboardCheck,
  FileImage,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const answerKey = "AABBCDBDCA".split("");

const text = {
  title: "\u8a66\u5377\u6279\u6539",
  lead: "\u6a19\u6e96\u7b54\u6848 AABBC DBDCA\uff0c\u8b80\u53d6\u7b2c 1 \u5230 10 \u984c\u3002",
  uploadTitle: "\u7b54\u6848\u5361",
  uploadDescription:
    "\u76f4\u63a5\u62cd\u7167\u6216\u4e0a\u50b3\u7167\u7247\uff0c\u8acb\u8b93\u7b2c 1 \u5230 10 \u984c\u6e05\u695a\u5165\u93e1\u3002",
  chooseImage: "\u9078\u64c7\u7b54\u6848\u5361",
  cameraHint: "\u624b\u6a5f\u53ef\u76f4\u63a5\u958b\u76f8\u6a5f\u62cd\u7167",
  replaceImage: "\u63db\u4e00\u5f35",
  start: "\u958b\u59cb\u6279\u6539",
  loading: "\u6279\u6539\u4e2d",
  resultTitle: "\u6279\u6539\u7d50\u679c",
  resultReady: "Gemini \u8b80\u5230\u7684\u7b54\u6848\u8207\u6a19\u6e96\u7b54\u6848\u6bd4\u5c0d\u5982\u4e0b\u3002",
  resultEmpty: "\u6279\u6539\u5b8c\u6210\u5f8c\u6703\u5728\u9019\u88e1\u986f\u793a\u6bcf\u984c\u7d50\u679c\u3002",
  score: "\u5206\u6578",
  correct: "\u7b54\u5c0d",
  wrong: "\u7b54\u932f",
  detected: "\u8b80\u5230",
  blank: "\u7a7a\u767d",
  answer: "\u6b63\u89e3",
  confidence: "\u4fe1\u5fc3",
  raw: "Gemini \u56de\u50b3",
  emptyTitle: "\u5c1a\u672a\u6279\u6539",
  emptyDescription: "\u4e0a\u50b3\u7b54\u6848\u5361\u5f8c\u958b\u59cb\u6279\u6539\u3002",
  fallbackError: "\u6279\u6539\u5931\u6557\uff0c\u8acb\u518d\u8a66\u4e00\u6b21\u3002",
  previewAlt: "\u7b54\u6848\u5361\u9810\u89bd",
};

type GradeRow = {
  question: number;
  correctAnswer: string;
  detectedAnswer: string | null;
  status: string;
  confidence: number | null;
  isCorrect: boolean;
};

type GradeResult = {
  answerKey: string[];
  score: number;
  total: number;
  correctCount: number;
  rows: GradeRow[];
  extracted: unknown;
  notes: string | null;
  rawText?: string;
  model: string;
};

type GradeResponse = Partial<GradeResult> & {
  message?: string;
};

export default function ExamGradingPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const wrongCount = useMemo(() => {
    if (!result) return 0;
    return result.total - result.correctCount;
  }, [result]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    const nextPreviewUrl = nextFile ? URL.createObjectURL(nextFile) : null;
    previewUrlRef.current = nextPreviewUrl;
    setFile(nextFile);
    setPreviewUrl(nextPreviewUrl);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/grade", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as GradeResponse;
      if (!response.ok) {
        throw new Error(payload.message ?? text.fallbackError);
      }

      setResult(payload as GradeResult);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : text.fallbackError
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mac-glass mac-hairline shrink-0 border-b px-4 py-3 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">
                {text.title}
              </h1>
              <Badge variant="outline" className="rounded-md">
                Gemini API MVP
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {text.lead}
            </p>
          </div>

          <div className="flex max-w-xl flex-wrap gap-1.5">
            {answerKey.map((answer, index) => (
              <Badge
                key={`${answer}-${index}`}
                variant="secondary"
                className="h-6 rounded-md px-2 font-semibold"
              >
                {index + 1}.{answer}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-nav-safe md:pb-0">
      <div className="grid gap-4 p-4 md:p-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>{text.uploadTitle}</CardTitle>
            <CardDescription>{text.uploadDescription}</CardDescription>
            <CardAction>
              <FileImage className="text-muted-foreground" size={20} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label
                className={cn(
                  "relative grid min-h-[320px] cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 md:min-h-[420px]",
                  previewUrl && "border-transparent bg-neutral-950"
                )}
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={text.previewAlt}
                    className="block max-h-[520px] w-full object-contain"
                    src={previewUrl}
                  />
                ) : (
                  <div className="grid justify-items-center gap-3 text-center text-muted-foreground">
                    <UploadCloud size={36} />
                    <div>
                      <p className="font-semibold text-foreground">
                        {text.chooseImage}
                      </p>
                      <p className="mt-1 text-xs">{text.cameraHint}</p>
                    </div>
                  </div>
                )}
                <input
                  accept="image/*"
                  capture="environment"
                  className="absolute size-px opacity-0"
                  name="image"
                  onChange={handleFileChange}
                  type="file"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
                  <Camera size={16} />
                  {text.replaceImage}
                  <input
                    accept="image/*"
                    capture="environment"
                    className="absolute size-px opacity-0"
                    name="image"
                    onChange={handleFileChange}
                    type="file"
                  />
                </label>
                <Button
                  className="h-10"
                  disabled={!file || isLoading}
                  type="submit"
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <ClipboardCheck size={16} />
                  )}
                  {isLoading ? text.loading : text.start}
                </Button>
              </div>

              {error ? (
                <div
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                  <span>{error}</span>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>{text.resultTitle}</CardTitle>
            <CardDescription>
              {result ? text.resultReady : text.resultEmpty}
            </CardDescription>
            {result ? (
              <CardAction>
                <Badge variant="outline" className="rounded-md">
                  {result.model}
                </Badge>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <ScoreTile label={text.score} value={`${result.score}/${result.total}`} />
                  <ScoreTile
                    label={text.correct}
                    value={String(result.correctCount)}
                    tone="success"
                  />
                  <ScoreTile
                    label={text.wrong}
                    value={String(wrongCount)}
                    tone="danger"
                  />
                </div>

                {result.notes ? (
                  <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
                    {result.notes}
                  </p>
                ) : null}

                <div className="grid gap-2">
                  {result.rows.map((row) => (
                    <article
                      key={row.question}
                      className="grid min-h-16 grid-cols-[42px_1fr_34px] items-center gap-3 rounded-lg border border-border bg-white p-3"
                    >
                      <div className="grid size-10 place-items-center rounded-lg bg-muted font-semibold">
                        {row.question}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {text.detected}{" "}
                          <span
                            className={
                              row.detectedAnswer ? "" : "text-muted-foreground"
                            }
                          >
                            {row.detectedAnswer ?? text.blank}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            / {text.answer} {row.correctAnswer}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.status}
                          {row.confidence !== null
                            ? ` / ${text.confidence} ${Math.round(
                                row.confidence * 100
                              )}%`
                            : ""}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "grid size-8 place-items-center rounded-full",
                          row.isCorrect
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-600"
                        )}
                      >
                        {row.isCorrect ? <Check size={16} /> : <X size={16} />}
                      </div>
                    </article>
                  ))}
                </div>

                <details className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-foreground">
                    {text.raw}
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {JSON.stringify(
                      { extracted: result.extracted, rawText: result.rawText },
                      null,
                      2
                    )}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-muted-foreground">
                <div>
                  <ClipboardCheck className="mx-auto mb-3" size={40} />
                  <p className="font-semibold text-foreground">
                    {text.emptyTitle}
                  </p>
                  <p className="mt-1 text-sm">{text.emptyDescription}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

function ScoreTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "success" && "text-emerald-700",
          tone === "danger" && "text-red-600"
        )}
      >
        {value}
      </p>
    </div>
  );
}
