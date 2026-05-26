export type MCQ = {
  question: string;
  options: string[]; // length 4
  answer_index: number; // 0..3
  explanation?: string;
};

export type Flashcard = {
  id?: string;
  front: string;
  back: string;
};

export type Upload = {
  id: string;
  user_id: string;
  filename: string;
  size_bytes: number;
  text_length: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  created_at: string;
};

export type Quiz = {
  id: string;
  upload_id: string;
  user_id: string;
  summary: string;
  mcqs: MCQ[];
  created_at: string;
};

export type GenerateResult = {
  summary: string;
  mcqs: MCQ[];
  flashcards: Flashcard[];
};

export type ApiError = { error: string };
