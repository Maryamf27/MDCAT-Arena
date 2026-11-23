import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBJECT_META, type SubjectMeta } from "@/lib/subjects";

export type SubjectRecord = {
  /** Supabase UUID; null when the syllabus import has not created this subject yet. */
  id: string | null;
  meta: SubjectMeta;
  name: string;
  unitCount: number | null;
  /** Exact count of questions whose database row is marked active; null means unavailable. */
  questionCount: number | null;
};

export type SubjectsResult = {
  ok: true;
  subjects: SubjectRecord[];
  availabilityMessage: string | null;
};

function unavailableSubjects(message: string): SubjectsResult {
  return {
    ok: true,
    availabilityMessage: message,
    subjects: SUBJECT_META.map((meta) => ({
      id: null,
      meta,
      name: meta.label,
      unitCount: null,
      questionCount: null,
    })),
  };
}

/** Always renders all official MDCAT subjects; availability comes only from Supabase. */
export async function getSubjects(): Promise<SubjectsResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("subjects").select("id,code,name");
    if (error) {
      console.error("[subjects] could not load subjects:", error.message);
      return unavailableSubjects("Current subject and question availability could not be checked.");
    }

    const rows = (data ?? []) as Array<{ id: string; code: string; name: string | null }>;
    const rowsByCode = new Map(rows.map((row) => [row.code, row]));
    const subjectIds = rows.map((row) => row.id);
    const unitsBySubject = new Map<string, number>();
    let unitsReadable = false;
    if (subjectIds.length) {
      const { data: nodes, error: nodesError } = await supabase
        .from("syllabus_nodes")
        .select("subject_id")
        .eq("node_type", "unit");
      if (!nodesError && nodes) {
        unitsReadable = true;
        for (const node of nodes as { subject_id: string }[]) {
          unitsBySubject.set(node.subject_id, (unitsBySubject.get(node.subject_id) ?? 0) + 1);
        }
      }
    }

    const admin = createAdminClient();
    const subjects = await Promise.all(SUBJECT_META.map(async (meta): Promise<SubjectRecord> => {
      const row = rowsByCode.get(meta.code);
      if (!row) return { id: null, meta, name: meta.label, unitCount: 0, questionCount: 0 };
      const { count, error: countError } = await admin
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("subject_id", row.id)
        .eq("is_active", true);
      if (countError) {
        console.error(`[subjects] question count unavailable for ${meta.code}:`, countError.message);
      }
      return {
        id: row.id,
        meta,
        name: row.name?.trim() || meta.label,
        unitCount: unitsReadable ? (unitsBySubject.get(row.id) ?? 0) : null,
        questionCount: countError ? null : (count ?? 0),
      };
    }));

    return {
      ok: true,
      subjects,
      availabilityMessage: subjects.some((subject) => subject.questionCount === null)
        ? "One or more live question counts are unavailable. No availability values have been estimated."
        : null,
    };
  } catch (error) {
    console.error("[subjects] subject availability is unavailable:", error);
    return unavailableSubjects("Current subject and question availability could not be checked.");
  }
}
