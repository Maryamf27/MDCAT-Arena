import { DIFFICULTIES, type Difficulty } from "./types";



export type DbDifficulty = "easy" | "moderate" | "difficult";

const API_TO_DB: Record<Difficulty, DbDifficulty> = {
  easy: "easy",
  medium: "moderate",
  hard: "difficult",
};

const DB_TO_API: Record<DbDifficulty, Difficulty> = {
  easy: "easy",
  moderate: "medium",
  difficult: "hard",
};

/**
 * Legacy aliases accepted on input so existing callers that already send the
 * database words (`?difficulty=moderate`) keep working. Responses always use
 * the canonical API words.
 */
export const DIFFICULTY_INPUT_VALUES = [...DIFFICULTIES, "moderate", "difficult"] as const;

/** Canonicalises any known difficulty word (API or DB) to the API vocabulary. */
export function normalizeDifficulty(value: unknown): Difficulty | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if ((DIFFICULTIES as readonly string[]).includes(v)) return v as Difficulty;
  if (v in DB_TO_API) return DB_TO_API[v as DbDifficulty];
  return null;
}

/** API word -> value stored in questions.difficulty. */
export function toDbDifficulty(difficulty: Difficulty): DbDifficulty {
  return API_TO_DB[difficulty];
}

/**
 * questions.difficulty -> API word. A value outside the known vocabulary is
 * passed through untouched rather than hidden or guessed; the UI renders it
 * with a neutral badge.
 */
export function toApiDifficulty(value: string): string {
  return normalizeDifficulty(value) ?? value;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_TONE: Record<Difficulty, "success" | "warning" | "error"> = {
  easy: "success",
  medium: "warning",
  hard: "error",
};
