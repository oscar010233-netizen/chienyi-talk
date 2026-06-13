export type ErrorType = 'None' | 'Omission' | 'Insertion' | 'Mispronunciation';

export interface PhonemeResult {
  phoneme: string;
  accuracyScore: number;
  offset?: number;
  duration?: number;
}

export interface WordResult {
  word: string;
  accuracyScore: number;
  errorType: ErrorType;
  phonemes: PhonemeResult[];
}

export interface WeakPhoneme {
  phoneme: string;
  exampleWord: string;
  accuracyScore: number;
}

export interface PracticeResult {
  bookId: string;
  bookTitle: string;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  bestScore: number;
  words: WordResult[];
  weakPhonemes: WeakPhoneme[];
}
