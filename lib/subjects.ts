/**
 * Presentation metadata for the five MDCAT subjects.
 *
 * This holds NO database ids. Ids always come from the Supabase `subjects`
 * table; this map only links a subject's `code` (BIO, CHEM, …) to the route key
 * the practice API understands and to a display icon/blurb.
 */
export const SUBJECT_KEYS = [
  "biology",
  "chemistry",
  "physics",
  "english",
  "logical_reasoning",
] as const;

export type SubjectKey = (typeof SUBJECT_KEYS)[number];

export type SubjectMeta = {
  key: SubjectKey;
  code: string;
  label: string;
  icon: "dna" | "flask" | "atom" | "book" | "puzzle";
  blurb: string;
};

export const SUBJECT_META: readonly SubjectMeta[] = [
  { key: "biology", code: "BIO", label: "Biology", icon: "dna", blurb: "Cells, genetics, physiology and ecology." },
  { key: "chemistry", code: "CHEM", label: "Chemistry", icon: "flask", blurb: "Physical, organic and inorganic chemistry." },
  { key: "physics", code: "PHY", label: "Physics", icon: "atom", blurb: "Mechanics, electricity, waves and modern physics." },
  { key: "english", code: "ENG", label: "English", icon: "book", blurb: "Grammar, vocabulary and comprehension." },
  { key: "logical_reasoning", code: "LR", label: "Logical Reasoning", icon: "puzzle", blurb: "Critical thinking and problem solving." },
];

export function isSubjectKey(value: string): value is SubjectKey {
  return (SUBJECT_KEYS as readonly string[]).includes(value);
}

export function getSubjectMetaByKey(key: SubjectKey): SubjectMeta {
  return SUBJECT_META.find((s) => s.key === key) as SubjectMeta;
}

export function getSubjectMetaByCode(code: string): SubjectMeta | undefined {
  return SUBJECT_META.find((s) => s.code === code);
}
