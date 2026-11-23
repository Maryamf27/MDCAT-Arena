"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";
import { UserMenu } from "@/components/auth/user-menu";
import { SUBJECT_META, isSubjectKey, getSubjectMetaByKey } from "@/lib/subjects";

type Crumb = { label: string; href?: string };

const STATIC_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/practice": "Practice",
  "/mock-tests": "Mock Tests",
  "/subjects": "Subjects",
  "/performance": "Performance",
  "/history": "History",
  "/profile": "Profile",
};

function describe(pathname: string): { title: string; crumbs: Crumb[] } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "practice" && parts[1] === "history") {
    return parts[2]
      ? { title: "Saved results", crumbs: [{ label: "History", href: "/practice/history" }, { label: "Results" }] }
      : { title: "Practice history", crumbs: [{ label: "History" }] };
  }
  if (parts[0] === "practice" && parts[1]) {
    const key = decodeURIComponent(parts[1]);
    const label = isSubjectKey(key)
      ? getSubjectMetaByKey(key).label
      : (SUBJECT_META.find((s) => s.key === key)?.label ?? "Practice");
    return {
      title: `${label} Practice`,
      crumbs: [
        { label: "Practice", href: "/practice" },
        { label },
      ],
    };
  }
  const title = STATIC_TITLES[pathname] ?? "MDCAT Arena";
  return { title, crumbs: [] };
}

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { title, crumbs } = describe(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line bg-white px-4 md:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        className="btn btn-ghost btn-sm lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        {crumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="hidden text-xs text-muted sm:block">
            <ol className="flex items-center gap-1">
              <li>
                <Link href="/" className="hover:text-primary">Dashboard</Link>
              </li>
              {crumbs.map((c) => (
                <li key={c.label} className="flex items-center gap-1">
                  <ChevronRight size={12} aria-hidden />
                  {c.href ? (
                    <Link href={c.href} className="hover:text-primary">{c.label}</Link>
                  ) : (
                    <span aria-current="page" className="font-semibold text-ink">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="truncate font-heading text-lg font-bold leading-6 text-ink md:text-xl">
          {title}
        </h1>
      </div>

      <UserMenu />
    </header>
  );
}
