import { PracticeResult } from '@/types/result';

export const mockPracticeResult: PracticeResult = {
  bookId: 'book-001',
  bookTitle: 'Daily English Conversations',
  accuracyScore: 82,
  fluencyScore: 75,
  completenessScore: 90,
  pronunciationScore: 79,
  bestScore: 88,
  words: [
    {
      word: 'Greeting',
      accuracyScore: 85,
      errorType: 'None',
      phonemes: [
        { phoneme: 'ɡ', accuracyScore: 92 },
        { phoneme: 'r', accuracyScore: 78 },
        { phoneme: 'iː', accuracyScore: 88 },
        { phoneme: 't', accuracyScore: 91 },
        { phoneme: 'ɪ', accuracyScore: 55 },
        { phoneme: 'ŋ', accuracyScore: 72 },
      ],
    },
    {
      word: 'Appointment',
      accuracyScore: 70,
      errorType: 'Mispronunciation',
      phonemes: [
        { phoneme: 'ə', accuracyScore: 80 },
        { phoneme: 'p', accuracyScore: 88 },
        { phoneme: 'ɔɪ', accuracyScore: 45 },
        { phoneme: 'n', accuracyScore: 91 },
        { phoneme: 't', accuracyScore: 85 },
      ],
    },
  ],
  weakPhonemes: [
    { phoneme: 'θ', exampleWord: 'think', accuracyScore: 42 },
    { phoneme: 'ɪ', exampleWord: 'bit', accuracyScore: 55 },
    { phoneme: 'æ', exampleWord: 'cat', accuracyScore: 63 },
  ],
};
