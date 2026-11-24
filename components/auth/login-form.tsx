"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { DISPLAY_NAME_MAX, displayNameSchema } from "@/lib/profile/validation";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

/** Only allow same-site relative redirects (blocks //evil.com and /\evil.com). */
function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return value;
  }
  return "/";
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    let displayName: string | null = null;
    if (mode === "signup") {
      const parsedName = displayNameSchema.safeParse(name);
      if (!parsedName.success) {
        setError(name.trim() ? parsedName.error.issues[0]?.message ?? "Please enter a valid name." : "Please enter your name.");
        return;
      }
      displayName = parsedName.data;
    }

    const credentials = credentialsSchema.safeParse({ email: email.trim(), password });
    if (!credentials.success) {
      const emailIsInvalid = credentials.error.issues.some((issue) => issue.path[0] === "email");
      setError(emailIsInvalid ? "Please enter a valid email address." : "Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword(credentials.data);
        if (err) {
          setError(err.message);
          return;
        }
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          ...credentials.data,
          // Kept in auth user metadata; copied into profiles.display_name on first profile load.
          options: { data: { display_name: displayName } },
        });
        if (err) {
          setError(err.message);
          return;
        }
        if (!data.session) {
          setNotice("Account created. Check your email to confirm it, then sign in.");
          setMode("signin");
          return;
        }
      }
      if (mode === "signup") {
        // Best effort: create the profile row (with the name) right away.
        await fetch("/api/profile", { cache: "no-store" }).catch(() => undefined);
      }
      router.replace(next);
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
          <LogIn size={20} aria-hidden />
        </span>
        <div>
          <h2 className="text-heading">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
          <p className="text-small text-muted">Sign in to save your practice attempts.</p>
        </div>
      </div>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "signup" ? (
          <label className="flex flex-col gap-1 text-small font-bold">
            Name
            <input
              className="field"
              type="text"
              name="name"
              autoComplete="name"
              required
              maxLength={DISPLAY_NAME_MAX + 20}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-small font-bold">
          Email
          <input
            className="field"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1 text-small font-bold">
          <label htmlFor="auth-password">Password</label>
          <div className="relative">
            <input
              className="field pr-12"
              id="auth-password"
              type={passwordVisible ? "text" : "password"}
              name="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-3 flex items-center rounded p-1 text-muted hover:text-primary"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              aria-pressed={passwordVisible}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-[10px] border border-[#efc4c2] bg-[#fdf5f4] px-4 py-2 text-small">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-[10px] border border-line bg-mint-soft px-4 py-2 text-small">
            {notice}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        className="mt-4 w-full text-center text-small font-bold text-primary hover:underline"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setNotice(null);
        }}
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
