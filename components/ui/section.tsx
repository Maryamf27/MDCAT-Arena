import type { ReactNode } from "react";

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-title">{title}</h2>
        {description ? <p className="text-small text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
