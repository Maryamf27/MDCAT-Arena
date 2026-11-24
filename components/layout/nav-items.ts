import {
  ChartNoAxesColumn,
  FileCheck2,
  History,
  LayoutDashboard,
  Library,
  PencilLine,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact path (used for the dashboard at "/"). */
  exact?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/practice", label: "Practice", icon: PencilLine },
  { href: "/mock-tests", label: "Mock Tests", icon: FileCheck2 },
  { href: "/subjects", label: "Subjects", icon: Library },
  { href: "/performance", label: "Performance", icon: ChartNoAxesColumn },
  { href: "/practice/history", label: "Practice History", icon: History },
  { href: "/mock-tests/history", label: "Mock History", icon: History },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function matches(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The href of the single nav item that owns `pathname`: the most specific
 * (longest) match wins. Without this, "/practice/history" would also light up
 * "Practice" and "/mock-tests/history" would also light up "Mock Tests",
 * because each is a path-prefix match of its parent.
 */
export function getActiveHref(pathname: string, items: readonly NavItem[] = NAV_ITEMS): string | null {
  let best: NavItem | null = null;
  for (const item of items) {
    if (matches(item, pathname) && (!best || item.href.length > best.href.length)) best = item;
  }
  return best ? best.href : null;
}

export function isActive(item: NavItem, pathname: string): boolean {
  return getActiveHref(pathname) === item.href;
}
