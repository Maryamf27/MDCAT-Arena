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
  { href: "/history", label: "History", icon: History },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
