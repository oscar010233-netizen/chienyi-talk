export interface Tag {
  id: string;
  label: string;
}

export interface Book {
  id: string;
  title: string;
  series: string;
  coverColor: string;
  tags: string[];
  wordCount: number;
}

export interface PracticeWord {
  id: string;
  english: string;
  chinese: string;
}
