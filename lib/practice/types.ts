export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type QuestionScope = {
  subjectId?: string;
  unitId?: string;
  topicId?: string;
};

export type QuestionFilters = {
  scope: QuestionScope;
  difficulty?: Difficulty;
  limit: number;
};

/** Server-only: row including the answer key. Never serialise to a client. */
export type AnswerKey = {
  id: string;
  options: string[];
  correct_answer_index: number;
  explanation: string;
};

export type SubmittedAnswer = {
  questionId: string;
  /** 0-3, or null when the question was left unanswered. */
  selectedIndex: number | null;
};

export type QuestionResult = {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  correctOption: string;
  isCorrect: boolean;
  explanation: string;
};

export type ScoreSummary = {
  total: number;
  answered: number;
  unanswered: number;
  correct: number;
  incorrect: number;
  /** correct / total * 100, rounded to 1 decimal. */
  percentage: number;
};

export type SubmissionResult = {
  score: ScoreSummary;
  results: QuestionResult[];
};
