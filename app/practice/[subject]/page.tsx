import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PracticeSession } from "@/components/practice/practice-session";
import { SUBJECT_KEYS, getSubjectMetaByKey, isSubjectKey } from "@/lib/subjects";

export function generateStaticParams() {
  return SUBJECT_KEYS.map((subject) => ({ subject }));
}

export async function generateMetadata(props: PageProps<"/practice/[subject]">): Promise<Metadata> {
  const { subject } = await props.params;
  if (!isSubjectKey(subject)) return { title: "Practice" };
  return { title: `${getSubjectMetaByKey(subject).label} Practice` };
}

export default async function PracticeSubjectPage(props: PageProps<"/practice/[subject]">) {
  const { subject } = await props.params;
  if (!isSubjectKey(subject)) notFound();

  const meta = getSubjectMetaByKey(subject);
  return <PracticeSession subjectKey={meta.key} subjectLabel={meta.label} />;
}
