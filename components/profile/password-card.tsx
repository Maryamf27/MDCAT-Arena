"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const PASSWORD_MIN = 6;

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1 text-small font-bold">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          className="field pr-12 font-normal"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-3 flex items-center rounded p-1 text-muted hover:text-primary"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

export function PasswordCard({ email }: { email: string | null }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email) return setError("Your account has no email address, so the password can't be changed here.");
    if (!current) return setError("Enter your current password.");
    if (next.length < PASSWORD_MIN) return setError(`New password must be at least ${PASSWORD_MIN} characters.`);
    if (next !== confirm) return setError("The new passwords don't match.");
    if (next === current) return setError("Choose a password different from your current one.");

    setBusy(true);
    try {
      const supabase = createClient();
      // Re-verify the current password so a borrowed, still-signed-in session can't change it.
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyError) {
        setError("Your current password is incorrect.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setNotice("Password updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendResetLink() {
    if (!email) return;
    setError(null);
    setNotice(null);
    setLinkBusy(true);
    try {
      const { error: linkError } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (linkError) {
        setError(linkError.message);
        return;
      }
      setNotice(`Reset link sent to ${email}. Open it from your inbox to choose a new password.`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <section className="card flex flex-col gap-5 p-6 md:p-8" aria-labelledby="password-title">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-mint text-primary">
          <KeyRound size={20} aria-hidden />
        </span>
        <div>
          <h3 id="password-title" className="text-heading">Password</h3>
          <p className="text-small text-muted">Change it any time. You stay signed in on this device.</p>
        </div>
      </div>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <PasswordField id="current-password" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <div className="grid gap-4 md:grid-cols-2">
          <PasswordField id="new-password" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>

        {error ? (
          <p role="alert" className="rounded-[10px] border border-[#efc4c2] bg-[#fdf5f4] px-4 py-2 text-small">{error}</p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-[10px] border border-line bg-mint-soft px-4 py-2 text-small">{notice}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void sendResetLink()} disabled={linkBusy || !email}>
            <Mail size={16} aria-hidden />
            {linkBusy ? "Sending…" : "Forgot it? Email me a reset link"}
          </button>
        </div>
      </form>
    </section>
  );
}
