import { Atom, BookOpenText, Brain, Calculator, Dna, FlaskConical, Puzzle, type LucideIcon } from "lucide-react";
import type { SubjectMeta } from "@/lib/subjects";

const ICONS: Record<SubjectMeta["icon"], LucideIcon> = {
  dna: Dna,
  flask: FlaskConical,
  atom: Atom,
  book: BookOpenText,
  puzzle: Puzzle,
  calculator: Calculator,
  brain: Brain,
};

export function SubjectIcon({ name, size = 24 }: { name: SubjectMeta["icon"]; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} aria-hidden />;
}
