"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** null = still checking, true = signed in, false = signed out. */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const timer = window.setTimeout(() => setSignedIn(false), 0);
      return () => window.clearTimeout(timer);
    }
    const supabase = createClient();
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.user));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
