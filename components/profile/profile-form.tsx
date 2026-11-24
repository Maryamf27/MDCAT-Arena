"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Save, UserRound } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/client";
import { DISPLAY_NAME_MAX, displayNameSchema } from "@/lib/profile/validation";

type Profile = { userId: string; email: string | null; displayName: string | null; createdAt: string };

export function ProfileForm() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/profile", { cache: "no-store", signal });
      setLoadError(null);
      if (response.status === 401) {
        setSignedOut(true);
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Your profile could not be loaded.");
      setSignedOut(false);
      setProfile(body.data.profile as Profile);
      setName((body.data.profile as Profile).displayName ?? "");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setLoadError(cause instanceof Error ? cause.message : "Your profile could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please enter a valid name.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: parsed.data }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.details?.[0]?.message ?? body?.error?.message ?? "Your profile could not be saved.");
        return;
      }
      const saved = body.data.profile as Profile;
      setProfile(saved);
      setName(saved.displayName ?? "");
      setNotice("Profile saved.");
      // Best effort: mirror the name into the session so the header updates now.
      try {
        await createClient().auth.updateUser({ data: { display_name: saved.displayName } });
      } catch {
        /* the profile itself is saved; the header refreshes on next sign-in */
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (signedOut) {
    return (
      <EmptyState
        icon={UserRound}
        title="Sign in to manage your profile"
        description="Your profile is private to your account."
        action={<Link className="btn btn-primary" href={`/login?next=${encodeURIComponent("/profile")}`}>Sign in</Link>}
      />
    );
  }
  if (loadError) {
    return (
      <ErrorState
        title="Profile unavailable"
        description={loadError}
        action={<button className="btn btn-primary" onClick={() => void load()}>Try again</button>}
      />
    );
  }
  if (!profile) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading profile">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const unchanged = name.trim() === (profile.displayName ?? "");

  return (
    <form noValidate onSubmit={onSubmit} className="card flex flex-col gap-5 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-primary">
          <UserRound size={24} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-heading truncate">{profile.displayName || "Add your name"}</p>
          <p className="text-small text-muted">
            Member since{" "}
            {new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-small font-bold" htmlFor="profile-name">
        Name
        <input
          id="profile-name"
          name="name"
          className="field font-normal"
          type="text"
          autoComplete="name"
          maxLength={DISPLAY_NAME_MAX + 20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-describedby="profile-name-help"
        />
        <span id="profile-name-help" className="text-small font-normal text-muted">
          Shown in the header. 2 to {DISPLAY_NAME_MAX} characters.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-small font-bold" htmlFor="profile-email">
        Email
        <input id="profile-email" className="field font-normal" type="email" value={profile.email ?? ""} readOnly disabled />
      </label>

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

      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || unchanged}>
          <Save size={16} aria-hidden />
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
