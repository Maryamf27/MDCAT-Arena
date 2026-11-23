import type { ReactNode } from "react";

type Tone = "default" | "neutral" | "warning" | "info" | "success" | "error";

const TONE_CLASS: Record<Tone, string> = {
  default: "",
  neutral: "badge-neutral",
  warning: "badge-warning",
  info: "badge-info",
  success: "badge-success",
  error: "badge-error",
};

export function Badge({ tone = "default", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${TONE_CLASS[tone]}`}>{children}</span>;
}
