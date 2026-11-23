import { createClient } from "@/lib/supabase/server";
import { SUBJECT_META, getSubjectMetaByCode, type SubjectMeta } from "@/lib/subjects";

export type SubjectRecord = {
  /** Real UUID from public.subjects. */
  id: string;
  meta: SubjectMeta;
  /** Display name: the database `name` when present, otherwise the known label. */
  name: string;
  /** Number of unit nodes in syllabus_nodes, or null when it could not be read. */
  unitCount: number | null;
};

export type SubjectsResult =
  | { ok: true; subjects: SubjectRecord[] }
  | { ok: false; message: string };

/**
 * Loads the MDCAT subjects from Supabase (existing server client, anon key).
 * Unit counts are best-effort: if syllabus_nodes cannot be read, they are
 * simply omitted instead of being invented.
 */
export async function getSubjects(): Promise<SubjectsResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("subjects").select("*");
  if (error) {
    console.error("[subjects] could not load subjects:", error.message);
    return { ok: false, message: "We couldn't load the subjects right now." };
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  const unitsBySubject = new Map<string, number>();
  let unitsReadable = false;
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

  const subjects: SubjectRecord[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : null;
    const code = typeof row.code === "string" ? row.code : null;
    if (!id || !code) continue;
    const meta = getSubjectMetaByCode(code);
    if (!meta) continue; // not one of the five MDCAT subjects
    const dbName = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
    const units = unitsBySubject.get(id);
    subjects.push({
      id,
      meta,
      name: dbName ?? meta.label,
      unitCount: unitsReadable && units ? units : null,
    });
  }

  subjects.sort(
    (a, b) =>
      SUBJECT_META.findIndex((m) => m.key === a.meta.key) -
      SUBJECT_META.findIndex((m) => m.key === b.meta.key)
  );

  return { ok: true, subjects };
}
