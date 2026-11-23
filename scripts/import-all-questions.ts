/**
 * Wrapper: runs the existing scripts/import-questions.ts once per subject dataset.
 *
 *   npm run import:questions:all:check   # passes --dry-run to every run
 *   npm run import:questions:all         # real import (needs .env)
 *
 * No import logic lives here. Validation, duplicate detection, syllabus
 * resolution, Supabase verification and answer-key exposure checks all come
 * from import-questions.ts. Stops at the first failing subject.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DATASETS = [
    "scraper/output/biology/authored-questions.json",
    "scraper/output/chemistry/authored-questions.json",
    "scraper/output/physics/authored-questions.json",
    "scraper/output/english/authored-questions.json",
    "scraper/output/logical_reasoning/authored-questions.json",
];

const dryRun = process.argv.slice(2).includes("--dry-run");
const missing = DATASETS.filter((d) => !fs.existsSync(path.resolve(d)));
if (missing.length) {
    console.error(`ERROR: missing dataset file(s):\n  ${missing.join("\n  ")}`);
    process.exit(1);
}

for (const dataset of DATASETS) {
    console.log(`\n===== ${dataset}${dryRun ? " (dry run)" : ""} =====`);
    const args = ["tsx", "scripts/import-questions.ts", "--dataset", dataset];
    if (dryRun) args.push("--dry-run");
    const result = spawnSync("npx", args, {
        stdio: "inherit",
        shell: process.platform === "win32",
    });
    if (result.error || result.status !== 0) {
        console.error(`\nStopped: import failed for ${dataset} (exit ${result.status ?? "n/a"}).`);
        process.exit(result.status || 1);
    }
}
console.log(`\nAll ${DATASETS.length} datasets completed${dryRun ? " (dry run, no database access)" : ""}.`);