"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Phase = "checking" | "ready" | "invalid";

/** Landing page for the password-reset email link. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const timer = window.setTimeout(() => setPhase("invalid"), 0);
      return () => window.clearTimeout(timer);
    }
    const supabase = createClient();
    let active = true;
    // The client exchanges the link's code for a recovery session on load.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && (event === "PASSWORD_RECOVERY" || session)) setPhase("ready");
    });
    // If nothing arrives, the link is missing, used or expired.
    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (active) setPhase(data.session ? "ready" : "invalid");
      });
    }, 2500);
    return () => {
      active = false;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("The passwords don't match.");

    setBusy(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.replace("/profile");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mx-auto w-full max-w-md p-6 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-mint text-primary">
          <KeyRound size={20} aria-hidden />
        </span>
        <div>
          <h2 className="text-heading">Choose a new password</h2>
          <p className="text-small text-muted">Enter and confirm your new password.</p>
        </div>
      </div>

      {phase === "checking" ? (
        <p role="status" className="text-small text-muted">Checking your reset link…</p>
      ) : null}

      {phase === "invalid" ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="rounded-[10px] border border-[#efc4c2] bg-[#fdf5f4] px-4 py-2 text-small">
            This reset link is invalid or has expired. Request a new one from your profile page.
          </p>
          <Link href="/profile" className="btn btn-primary">Go to profile</Link>
        </div>
      ) : null}

      {phase === "ready" ? (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-small font-bold">
            New password
            <input className="field font-normal" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-small font-bold">
            Confirm new password
            <input className="field font-normal" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error ? (
            <p role="alert" className="rounded-[10px] border border-[#efc4c2] bg-[#fdf5f4] px-4 py-2 text-small">{error}</p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Please wait…" : "Update password"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
