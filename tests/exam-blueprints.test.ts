import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EXAM_BLUEPRINTS, getBlueprint } from "@/lib/exam-blueprints";
import { SUBJECT_META } from "@/lib/subjects";
import { blueprintDbFields, configSchema } from "@/lib/practice/mock-exams";

describe("MVP examination blueprints", () => {
  it("keeps existing MDCAT keys unique and adds separate namespaced subject keys", () => {
    const keys = SUBJECT_META.map(({ key }) => key);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(
      SUBJECT_META.filter(({ examKey }) => examKey === "mdcat").map(({ key }) => key),
      ["biology", "chemistry", "physics", "english", "logical_reasoning"],
    );
    assert.equal(SUBJECT_META.filter(({ examKey }) => examKey === "ecat").length, 4);
    assert.equal(SUBJECT_META.filter(({ examKey }) => examKey === "nts_nat").length, 6);
  });

  it("matches the UET ECAT Pre-Engineering source blueprint", () => {
    const blueprint = getBlueprint("ecat", "pre_engineering");
    assert.ok(blueprint);
    assert.equal(blueprint.durationSeconds, 6000);
    assert.deepEqual(blueprint.distribution, {
      ecat_mathematics: 30,
      ecat_physics: 30,
      ecat_chemistry: 30,
      ecat_english: 10,
    });
    assert.equal(blueprint.marksPerCorrect, 4);
    assert.equal(blueprint.negativeMarking, false);
    assert.equal(blueprint.verificationStatus, "verified");
    assert.match(blueprint.sourceUrl, /^https:\/\//);
  });

  it("matches the NTS NAT-IE section counts and records partial scoring verification", () => {
    const blueprint = getBlueprint("nts_nat", "nat_ie");
    assert.ok(blueprint);
    assert.equal(blueprint.durationSeconds, 7200);
    assert.equal(Object.values(blueprint.distribution).reduce((sum, count) => sum + count, 0), 90);
    assert.deepEqual(blueprint.distribution, {
      nat_ie_english: 20,
      nat_ie_analytical: 20,
      nat_ie_quantitative: 20,
      nat_ie_physics: 10,
      nat_ie_chemistry: 10,
      nat_ie_mathematics: 10,
    });
    assert.equal(blueprint.verificationStatus, "partial");
    assert.equal(blueprint.provisional, true);
    assert.match(blueprint.verificationNote, /pending confirmation/i);
  });

  it("accepts an official track config and rejects distribution subjects from another exam", () => {
    const valid = configSchema.safeParse({
      examKey: "nts_nat",
      categoryKey: "nat_ie",
      title: "NTS NAT-IE",
      durationSeconds: 7200,
      distribution: { nat_ie_english: 20, nat_ie_analytical: 20 },
    });
    assert.equal(valid.success, true);
    const forgedVerification = configSchema.safeParse({
      ...(valid.success ? valid.data : {}),
      blueprint_verification_status: "verified",
    });
    assert.equal(forgedVerification.success, false);

    const mixed = configSchema.safeParse({
      examKey: "ecat",
      categoryKey: "pre_engineering",
      title: "Mixed test",
      durationSeconds: 6000,
      distribution: { ecat_mathematics: 30, biology: 1 },
    });
    assert.equal(mixed.success, false);
  });

  it("derives source verification server-side and downgrades altered settings", () => {
    const ecat = EXAM_BLUEPRINTS.find(({ examKey }) => examKey === "ecat");
    assert.ok(ecat);
    const exact = configSchema.parse({
      examKey: ecat.examKey,
      categoryKey: ecat.categoryKey,
      title: ecat.label,
      durationSeconds: ecat.durationSeconds,
      distribution: ecat.distribution,
      marksPerCorrect: ecat.marksPerCorrect,
      negativeMarking: ecat.negativeMarking,
      marksDeducted: ecat.marksDeducted,
      provisional: false,
    });
    assert.equal(blueprintDbFields(exact).blueprint_verification_status, "verified");

    const changed = configSchema.parse({ ...exact, durationSeconds: 7000 });
    const fields = blueprintDbFields(changed);
    assert.equal(fields.blueprint_verification_status, "unverified");
    assert.equal(fields.is_provisional, true);
  });
});
