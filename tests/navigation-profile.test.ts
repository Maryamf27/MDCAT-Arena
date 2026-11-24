// Unit tests for sidebar active-state logic and the profile module.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NAV_ITEMS, getActiveHref, isActive } from "@/components/layout/nav-items";
import {
  displayNameSchema,
  normalizeDisplayName,
  sanitizeDisplayName,
  updateProfileSchema,
} from "@/lib/profile/validation";
import { getOrCreateProfile, updateDisplayName } from "@/lib/profile/repository";

const activeLabels = (pathname: string) =>
  NAV_ITEMS.filter((item) => isActive(item, pathname)).map((item) => item.label);

describe("sidebar active item", () => {
  it("Practice History highlights ONLY itself, not Practice", () => {
    assert.deepEqual(activeLabels("/practice/history"), ["Practice History"]);
  });

  it("Mock History highlights ONLY itself, not Mock Tests", () => {
    assert.deepEqual(activeLabels("/mock-tests/history"), ["Mock History"]);
  });

  it("Practice and Mock Tests still highlight on their own pages", () => {
    assert.deepEqual(activeLabels("/practice"), ["Practice"]);
    assert.deepEqual(activeLabels("/mock-tests"), ["Mock Tests"]);
  });

  it("nested pages belong to the most specific parent", () => {
    assert.deepEqual(activeLabels("/practice/biology"), ["Practice"]);
    assert.deepEqual(activeLabels("/practice/history/0b1c2d3e"), ["Practice History"]);
    assert.deepEqual(activeLabels("/mock-tests/attempt/abc"), ["Mock Tests"]);
    assert.deepEqual(activeLabels("/mock-tests/history/anything"), ["Mock History"]);
  });

  it("the dashboard matches only the exact root path", () => {
    assert.deepEqual(activeLabels("/"), ["Dashboard"]);
    assert.deepEqual(activeLabels("/profile"), ["Profile"]);
    assert.deepEqual(activeLabels("/subjects"), ["Subjects"]);
    assert.deepEqual(activeLabels("/performance"), ["Performance"]);
  });

  it("does not match look-alike prefixes", () => {
    assert.equal(getActiveHref("/practice-extra"), null);
    assert.equal(getActiveHref("/profiles"), null);
  });

  it("every nav item is reachable and exactly one item is active at its own href", () => {
    for (const item of NAV_ITEMS) {
      assert.deepEqual(activeLabels(item.href), [item.label], item.href);
    }
  });

  it("unknown paths highlight nothing", () => {
    assert.deepEqual(activeLabels("/nope"), []);
  });
});

describe("display name validation", () => {
  it("accepts ordinary and non-Latin names", () => {
    for (const name of ["Ali", "Ayesha Khan", "Sara-Jane O'Neil", "عائشہ خان", "Zoë Müller"]) {
      assert.ok(displayNameSchema.safeParse(name).success, name);
    }
  });

  it("accepts zero-width joiners used in Urdu/Persian names", () => {
    assert.ok(displayNameSchema.safeParse("می\u200cخواهم").success);
  });

  it("trims and collapses whitespace", () => {
    assert.equal(normalizeDisplayName("  Sara \t  Ahmed \n"), "Sara Ahmed");
    assert.equal(sanitizeDisplayName("  Sara   Ahmed "), "Sara Ahmed");
  });

  it("rejects blank, too short, too long, markup and control characters", () => {
    for (const bad of ["", "   ", "A", "x".repeat(51), "<b>Hi</b>", "Bad\u0007Name", "Name\u0000"]) {
      assert.equal(displayNameSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
    assert.ok(displayNameSchema.safeParse("x".repeat(50)).success);
  });

  it("sanitizeDisplayName returns null for non-strings and invalid values", () => {
    assert.equal(sanitizeDisplayName(undefined), null);
    assert.equal(sanitizeDisplayName(null), null);
    assert.equal(sanitizeDisplayName(42), null);
    assert.equal(sanitizeDisplayName("<script>"), null);
  });

  it("PATCH body schema is strict: only displayName is allowed", () => {
    assert.ok(updateProfileSchema.safeParse({ displayName: "Ali Raza" }).success);
    assert.equal(updateProfileSchema.safeParse({ displayName: "Ali Raza", role: "admin" }).success, false);
    assert.equal(updateProfileSchema.safeParse({}).success, false);
  });
});

type Row = { user_id: string; display_name: string | null; created_at: string; role: string };

/** Minimal in-memory stand-in for the `profiles` table via the supabase-js chain. */
function fakeProfilesDb(initial: Row[] = []) {
  const rows = [...initial];
  const writes: string[] = [];
  const db = {
    from(table: string) {
      assert.equal(table, "profiles");
      return {
        select: () => ({
          eq: (_c: string, id: string) => ({
            maybeSingle: async () => ({ data: rows.find((r) => r.user_id === id) ?? null, error: null }),
          }),
        }),
        upsert: async (row: { user_id: string; display_name: string | null }, opts: { ignoreDuplicates?: boolean }) => {
          writes.push(`upsert:${Object.keys(row).sort().join(",")}`);
          const existing = rows.find((r) => r.user_id === row.user_id);
          if (!existing) rows.push({ role: "user", created_at: "2026-11-24T00:00:00Z", ...row });
          else if (!opts?.ignoreDuplicates) Object.assign(existing, row);
          return { error: null };
        },
        update: (patch: { display_name: string }) => ({
          eq: (_c: string, id: string) => ({
            is: async () => {
              writes.push(`update:${Object.keys(patch).join(",")}`);
              const r = rows.find((x) => x.user_id === id && x.display_name === null);
              if (r) Object.assign(r, patch);
              return { error: null };
            },
          }),
        }),
      };
    },
  };
  return { db: db as unknown as SupabaseClient, rows, writes };
}

const USER = { id: "u-1", email: "a@b.dev" };

describe("profile repository", () => {
  it("creates the profile on first use, seeded with the sign-up name", async () => {
    const { db, rows } = fakeProfilesDb();
    const p = await getOrCreateProfile(db, { ...USER, displayName: "  Ayesha   Khan " });
    assert.equal(p.displayName, "Ayesha Khan");
    assert.equal(p.email, USER.email);
    assert.equal(rows.length, 1);
  });

  it("creates the profile with no name when none was given", async () => {
    const { db } = fakeProfilesDb();
    assert.equal((await getOrCreateProfile(db, { ...USER, displayName: null })).displayName, null);
  });

  it("never stores an invalid sign-up name from user-editable metadata", async () => {
    const { db, rows } = fakeProfilesDb();
    const p = await getOrCreateProfile(db, { ...USER, displayName: "<img src=x onerror=1>" });
    assert.equal(p.displayName, null);
    assert.equal(rows[0].display_name, null);
  });

  it("back-fills a missing name on an existing row, without creating another row", async () => {
    const { db, rows } = fakeProfilesDb([{ user_id: "u-1", display_name: null, created_at: "2026-01-01T00:00:00Z", role: "user" }]);
    const p = await getOrCreateProfile(db, { ...USER, displayName: "Ayesha Khan" });
    assert.equal(p.displayName, "Ayesha Khan");
    assert.equal(rows.length, 1);
  });

  it("keeps an existing name (sign-up metadata never overwrites a saved name)", async () => {
    const { db, writes } = fakeProfilesDb([{ user_id: "u-1", display_name: "Saved Name", created_at: "2026-01-01T00:00:00Z", role: "user" }]);
    const p = await getOrCreateProfile(db, { ...USER, displayName: "Other Name" });
    assert.equal(p.displayName, "Saved Name");
    assert.deepEqual(writes, []);
  });

  it("updateDisplayName writes only user_id and display_name, never role", async () => {
    const { db, rows, writes } = fakeProfilesDb([{ user_id: "u-1", display_name: "Old", created_at: "2026-01-01T00:00:00Z", role: "admin" }]);
    const p = await updateDisplayName(db, USER, "New Name");
    assert.equal(p.displayName, "New Name");
    assert.deepEqual(writes, ["upsert:display_name,user_id"]);
    assert.equal(rows[0].role, "admin");
  });
});
