/**
 * Stable, exam-scoped subject keys and their presentation/database metadata.
 * Existing MDCAT keys and codes are intentionally unchanged.
 */
export const SUBJECT_META = [
  { key: "biology", code: "BIO", label: "Biology", icon: "dna", blurb: "Cells, genetics, physiology and ecology.", examKey: "mdcat", examLabel: "MDCAT", categoryKey: null, practiceTitle: "Biology Practice" },
  { key: "chemistry", code: "CHEM", label: "Chemistry", icon: "flask", blurb: "Physical, organic and inorganic chemistry.", examKey: "mdcat", examLabel: "MDCAT", categoryKey: null, practiceTitle: "Chemistry Practice" },
  { key: "physics", code: "PHY", label: "Physics", icon: "atom", blurb: "Mechanics, electricity, waves and modern physics.", examKey: "mdcat", examLabel: "MDCAT", categoryKey: null, practiceTitle: "Physics Practice" },
  { key: "english", code: "ENG", label: "English", icon: "book", blurb: "Grammar, vocabulary and comprehension.", examKey: "mdcat", examLabel: "MDCAT", categoryKey: null, practiceTitle: "English Practice" },
  { key: "logical_reasoning", code: "LR", label: "Logical Reasoning", icon: "puzzle", blurb: "Critical thinking and problem solving.", examKey: "mdcat", examLabel: "MDCAT", categoryKey: null, practiceTitle: "Logical Reasoning Practice" },

  { key: "ecat_mathematics", code: "ECAT_MATH", label: "Mathematics", icon: "calculator", blurb: "UET ECAT Pre-Engineering mathematics.", examKey: "ecat", examLabel: "UET ECAT", categoryKey: "pre_engineering", practiceTitle: "UET ECAT Pre-Engineering Mathematics Practice" },
  { key: "ecat_physics", code: "ECAT_PHY", label: "Physics", icon: "atom", blurb: "UET ECAT Pre-Engineering physics.", examKey: "ecat", examLabel: "UET ECAT", categoryKey: "pre_engineering", practiceTitle: "UET ECAT Pre-Engineering Physics Practice" },
  { key: "ecat_chemistry", code: "ECAT_CHEM", label: "Chemistry", icon: "flask", blurb: "UET ECAT Pre-Engineering chemistry.", examKey: "ecat", examLabel: "UET ECAT", categoryKey: "pre_engineering", practiceTitle: "UET ECAT Pre-Engineering Chemistry Practice" },
  { key: "ecat_english", code: "ECAT_ENG", label: "English", icon: "book", blurb: "UET ECAT English comprehension practice.", examKey: "ecat", examLabel: "UET ECAT", categoryKey: "pre_engineering", practiceTitle: "UET ECAT Pre-Engineering English Practice" },

  { key: "nat_ie_english", code: "NAT_IE_ENG", label: "English", icon: "book", blurb: "NTS NAT-IE English.", examKey: "nts_nat", examLabel: "NTS NAT", categoryKey: "nat_ie", practiceTitle: "NTS NAT-IE English Practice" },
  { key: "nat_ie_analytical", code: "NAT_IE_ANALYTICAL", label: "Analytical", icon: "brain", blurb: "NTS NAT-IE analytical reasoning.", examKey: "nts_nat", examLabel: "NTS NAT", categoryKey: "nat_ie", practiceTitle: "NTS NAT-IE Analytical Practice" },
  { key: "nat_ie_quantitative", code: "NAT_IE_QUANTITATIVE", label: "Quantitative", icon: "calculator", blurb: "NTS NAT-IE quantitative reasoning.", examKey: "nts_nat", examLabel: "NTS NAT", categoryKey: "nat_ie", practiceTitle: "NTS NAT-IE Quantitative Practice" },
  { key: "nat_ie_physics", code: "NAT_IE_PHY", label: "Physics", icon: "atom", blurb: "NTS NAT-IE physics.", examKey: "nts_nat", examLabel: "NTS NAT", categoryKey: "nat_ie", practiceTitle: "NTS NAT-IE Physics Practice" },
  { key: "nat_ie_chemistry", code: "NAT_IE_CHEM", label: "Chemistry", icon: "flask", blurb: "NTS NAT-IE chemistry.", examKey: "nts_nat", examLabel: "NTS NAT", categoryKey: "nat_ie", practiceTitle: "NTS NAT-IE Chemistry Practice" },
  { key: "nat_ie_mathematics", code: "NAT_IE_MATH", label: "Mathematics", icon: "calculator", blurb: "NTS NAT-IE mathematics.", examKey: "nts_nat", examLabel: "NTS NAT", categoryKey: "nat_ie", practiceTitle: "NTS NAT-IE Mathematics Practice" },
] as const;

export type SubjectKey = (typeof SUBJECT_META)[number]["key"];
export type ExamKey = (typeof SUBJECT_META)[number]["examKey"];
export type SubjectMeta = (typeof SUBJECT_META)[number];

export const SUBJECT_KEYS = SUBJECT_META.map((subject) => subject.key) as [SubjectKey, ...SubjectKey[]];
export const EXAM_KEYS = ["mdcat", "ecat", "nts_nat"] as const;

export function isSubjectKey(value: string): value is SubjectKey {
  return SUBJECT_META.some((subject) => subject.key === value);
}

export function getSubjectMetaByKey(key: SubjectKey): SubjectMeta {
  return SUBJECT_META.find((subject) => subject.key === key)!;
}

export function getSubjectMetaByCode(code: string): SubjectMeta | undefined {
  return SUBJECT_META.find((subject) => subject.code === code);
}

export function getSubjectsForExam(examKey: ExamKey): SubjectMeta[] {
  return SUBJECT_META.filter((subject) => subject.examKey === examKey);
}
