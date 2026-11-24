"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = { state: "loading" } | { state: "out" } | { state: "in"; email: string; name: string | null };

type SessionUser = { email?: string; user_metadata?: Record<string, unknown> };

function signedIn(user: SessionUser): Status {
  const name = user.user_metadata?.display_name;
  return { state: "in", email: user.email ?? "Student", name: typeof name === "string" && name.trim() ? name : null };
}

/** Header profile area, driven by the real Supabase session. */
export function UserMenu() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const timer = window.setTimeout(() => setStatus({ state: "out" }), 0);
      return () => window.clearTimeout(timer);
    }
    const supabase = createClient();
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setStatus(data.user ? signedIn(data.user) : { state: "out" });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session?.user ? signedIn(session.user) : { state: "out" });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (status.state === "loading") {
    return <div className="h-10 w-24 skeleton" aria-hidden />;
  }

  if (status.state === "out") {
    return (
      <Link href="/login" className="btn btn-secondary btn-sm">
        <LogIn size={16} aria-hidden />
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/profile"
        aria-label="Open your profile"
        className="flex items-center gap-2 rounded-[10px] border border-line px-2 py-1 no-underline hover:border-primary"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-mint text-primary">
          <UserRound size={18} aria-hidden />
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm font-bold text-ink sm:block" title={status.email}>
          {status.name ?? status.email}
        </span>
      </Link>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="Sign out"
        onClick={async () => {
          await createClient().auth.signOut();
          router.refresh();
        }}
      >
        <LogOut size={16} aria-hidden />
      </button>
    </div>
  );
}
