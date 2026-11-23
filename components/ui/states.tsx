import type { LucideIcon } from "lucide-react";
import { Inbox, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-box">
      <div className="state-icon">
        <Icon size={24} aria-hidden />
      </div>
      <h3 className="text-heading">{title}</h3>
      <p className="max-w-md text-small text-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-box state-box-error" role="alert">
      <div className="state-icon">
        <TriangleAlert size={24} aria-hidden />
      </div>
      <h3 className="text-heading">{title}</h3>
      <p className="max-w-md text-small text-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
