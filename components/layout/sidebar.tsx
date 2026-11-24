"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useSignedIn } from "@/components/auth/use-signed-in";
import { Brand } from "./brand";
import { NAV_ITEMS, isActive } from "./nav-items";

export function SidebarContent({ onNavigate, onClose }: { onNavigate?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  const signedIn = useSignedIn();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-line px-6">
        <Brand onNavigate={onNavigate} />
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="Close navigation"
          >
            <X size={18} aria-hidden />
          </button>
        ) : null}
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto p-4">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-control px-4 py-2 font-heading text-sm font-semibold no-underline transition-colors ${
                    active
                      ? "bg-primary text-white"
                      : "text-ink hover:bg-mint-soft hover:text-primary"
                  }`}
                >
                  <Icon size={20} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {signedIn === null ? null : (
        <div className="border-t border-line p-4">
          <p className="text-small text-muted">
            {signedIn
              ? "Your practice attempts are saved to your account."
              : "Sign in to save your practice attempts to your account."}
          </p>
        </div>
      )}
    </div>
  );
}
