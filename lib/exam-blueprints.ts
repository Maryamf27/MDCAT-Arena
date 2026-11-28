import type { ExamKey, SubjectKey } from "@/lib/subjects";

export type BlueprintVerificationStatus = "verified" | "partial" | "unverified";

export type ExamBlueprint = {
  key: string;
  examKey: Exclude<ExamKey, "mdcat">;
  categoryKey: string;
  label: string;
  sourceName: string;
  sourceUrl: string;
  verificationStatus: Exclude<BlueprintVerificationStatus, "unverified">;
  verifiedAt: string;
  verificationNote: string;
  durationSeconds: number;
  distribution: Partial<Record<SubjectKey, number>>;
  marksPerCorrect: number;
  negativeMarking: boolean;
  marksDeducted: number;
  provisional: boolean;
};

/** Official references captured when these MVP blueprints were checked. */
export const EXAM_BLUEPRINTS = [
  {
    key: "uet_ecat_pre_engineering_2026",
    examKey: "ecat",
    categoryKey: "pre_engineering",
    label: "UET ECAT Pre-Engineering",
    sourceName: "UET ECAT - About ECAT (Fall 2026)",
    sourceUrl: "https://ecat.uet.edu.pk/general/ecat",
    verificationStatus: "verified",
    verifiedAt: "2026-11-28",
    verificationNote: "Official UET page states 100 minutes, 10 English questions, 90 questions divided equally among the three selected subjects, four marks per correct answer, and no negative marking.",
    durationSeconds: 100 * 60,
    distribution: { ecat_mathematics: 30, ecat_physics: 30, ecat_chemistry: 30, ecat_english: 10 },
    marksPerCorrect: 4,
    negativeMarking: false,
    marksDeducted: 0,
    provisional: false,
  },
  {
    key: "nts_nat_ie_2026",
    examKey: "nts_nat",
    categoryKey: "nat_ie",
    label: "NTS NAT-IE",
    sourceName: "NTS NAT Paper Pattern and Questions Distribution",
    sourceUrl: "https://nts.org.pk/Products/NTSNAT/nat-paper-pattern.php",
    verificationStatus: "partial",
    verifiedAt: "2026-11-28",
    verificationNote: "Official NTS page confirms 90 questions, 120 minutes, and the six section counts. NTS does not state a per-question score or negative-marking rule on this reference; Arena uses one internal point per correct answer and no penalty pending confirmation.",
    durationSeconds: 120 * 60,
    distribution: {
      nat_ie_english: 20,
      nat_ie_analytical: 20,
      nat_ie_quantitative: 20,
      nat_ie_physics: 10,
      nat_ie_chemistry: 10,
      nat_ie_mathematics: 10,
    },
    marksPerCorrect: 1,
    negativeMarking: false,
    marksDeducted: 0,
    provisional: true,
  },
] as const satisfies readonly ExamBlueprint[];

export function getBlueprint(examKey: string, categoryKey: string | null | undefined): ExamBlueprint | undefined {
  return EXAM_BLUEPRINTS.find((blueprint) => blueprint.examKey === examKey && blueprint.categoryKey === categoryKey);
}

export function getBlueprintForKey(key: string | null | undefined): ExamBlueprint | undefined {
  return EXAM_BLUEPRINTS.find((blueprint) => blueprint.key === key);
}

export function blueprintDistribution(blueprint: ExamBlueprint): Record<string, number> {
  return { ...blueprint.distribution } as Record<string, number>;
}
