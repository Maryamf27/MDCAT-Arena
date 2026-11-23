import Link from "next/link";
import { GraduationCap } from "lucide-react";

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-2 no-underline">
      <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-primary text-white">
        <GraduationCap size={22} aria-hidden />
      </span>
      <span className="font-heading text-lg font-extrabold leading-none text-ink">
        MDCAT <span className="text-primary">Arena</span>
      </span>
    </Link>
  );
}
