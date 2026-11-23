import { z } from "zod";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBJECT_KEYS, SUBJECT_META } from "@/lib/subjects";

type SyllabusNode = { id: string; parent_id: string | null; node_type: string; title: string; source_identifier: string | null; source_path: string; sort_order: number | null };

export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const { subject: subjectKey } = z.object({ subject: z.enum(SUBJECT_KEYS) }).strict().parse(params);
    const meta = SUBJECT_META.find((item) => item.key === subjectKey);
    if (!meta) throw new ApiError(400, "validation_error", "Unknown subject");
    const db = createAdminClient();
    const { data: subject, error: subjectError } = await db.from("subjects").select("id,name").eq("code", meta.code).maybeSingle();
    if (subjectError) throw new ApiError(502, "database_error", "Syllabus filters could not be loaded");
    if (!subject) throw new ApiError(404, "subject_not_found", `The ${meta.label} syllabus has not been imported yet`);
    const { data, error } = await db.from("syllabus_nodes")
      .select("id,parent_id,node_type,title,source_identifier,source_path,sort_order")
      .eq("subject_id", subject.id).order("sort_order", { ascending: true });
    if (error) throw new ApiError(502, "database_error", "Syllabus filters could not be loaded");
    const nodes = (data ?? []) as unknown as SyllabusNode[];
    const topicsByParent = new Map<string, SyllabusNode[]>();
    const slosByParent = new Map<string, SyllabusNode[]>();
    for (const node of nodes) {
      if (!node.parent_id) continue;
      const parentMap = node.node_type === "topic" ? topicsByParent : node.node_type === "slo" ? slosByParent : null;
      if (!parentMap) continue;
      parentMap.set(node.parent_id, [...(parentMap.get(node.parent_id) ?? []), node]);
    }
    const units = nodes.filter((node) => node.node_type === "unit").map((unit) => ({
      id: unit.id,
      label: `${unit.source_path.split("/").at(-1) ?? ""} · ${unit.title}`,
      topics: (topicsByParent.get(unit.id) ?? []).map((topic) => ({
        id: topic.id,
        label: topic.title,
        slos: (slosByParent.get(topic.id) ?? []).map((slo) => ({
          id: slo.id,
          reference: slo.source_identifier ?? "",
          label: `${slo.source_identifier ? `${slo.source_identifier} · ` : ""}${slo.title}`,
        })),
      })),
    }));
    return ok({ subject: { id: subject.id, name: subject.name ?? meta.label, key: subjectKey }, units });
  } catch (error) {
    return errorResponse(error);
  }
}
