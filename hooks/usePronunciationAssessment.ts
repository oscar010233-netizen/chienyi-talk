'use client';

import { useState, useCallback, useRef } from 'react';
import { blobToWAV } from '@/lib/audio/encodeWAV';

export interface AssessmentResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
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
}

export type RecordingState = 'idle' | 'recording' | 'processing' | 'done' | 'error';

export const ASSESSMENT_STORAGE_KEY = 'chienyi_assessment_result';

async function callAssessmentAPI(
  wavBlob: Blob,
  referenceText: string
): Promise<AssessmentResult> {
  const formData = new FormData();
  formData.append('audio', wavBlob, 'recording.wav');
  formData.append('referenceText', referenceText);

  const res = await fetch('/api/pronunciation-assessment', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : `API 回應失敗 (${res.status})`
    );
  }

  return data as AssessmentResult;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function usePronunciationAssessment(referenceText: string) {
  const [state, setState] = useState<RecordingState>('idle');
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });

      chunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setState('processing');

        try {
          const rawBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });

          if (rawBlob.size < 1000) {
            throw new Error('錄音內容太短或為空，請重新錄製（至少說 1 秒）。');
          }

          const wavBlob = await blobToWAV(rawBlob, 16000);
          const assessmentResult = await callAssessmentAPI(wavBlob, referenceText);

          setResult(assessmentResult);
          localStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(assessmentResult));
          setState('done');
        } catch (err) {
          console.error('[pronunciation] recording failed:', err);
          setError(getErrorMessage(err));
          setState('error');
        }
      };

      mediaRecorder.start(100);
      setState('recording');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('請允許瀏覽器使用麥克風後再開始錄音。');
      } else {
        setError(`無法開始錄音：${getErrorMessage(err)}`);
      }
      setState('error');
    }
  }, [referenceText]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setState('idle');
    setResult(null);
    setError(null);
  }, []);

  return { state, result, error, startRecording, stopRecording, reset };
}
