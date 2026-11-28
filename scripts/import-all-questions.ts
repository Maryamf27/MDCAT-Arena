/** Run the existing validator/importer over one selected examination track. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TRACKS = {
  mdcat: {
    syllabus: "data/mdcat-syllabus.json",
    datasets: [
      "scraper/output/biology/authored-questions.json",
      "scraper/output/chemistry/authored-questions.json",
      "scraper/output/physics/authored-questions.json",
      "scraper/output/english/authored-questions.json",
      "scraper/output/logical-reasoning/authored-questions.json",
    ],
  },
  ecat: {
    syllabus: "data/ecat-pre-engineering-syllabus.json",
    datasets: ["ecat_mathematics", "ecat_physics", "ecat_chemistry", "ecat_english"].map((subject) => `scraper/output/${subject}/authored-questions.json`),
  },
  nts_nat: {
    syllabus: "data/nts-nat-ie-syllabus.json",
    datasets: ["nat_ie_english", "nat_ie_analytical", "nat_ie_quantitative", "nat_ie_physics", "nat_ie_chemistry", "nat_ie_mathematics"].map((subject) => `scraper/output/${subject}/authored-questions.json`),
  },
} as const;

const argv = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const dryRun = argv.includes("--dry-run");
const trackKey = flagValue("--track") ?? "mdcat";
if (!(trackKey in TRACKS)) {
  console.error(`ERROR: unknown track "${trackKey}". Choose mdcat, ecat, or nts_nat.`);
  process.exit(1);
}
const track = TRACKS[trackKey as keyof typeof TRACKS];
const syllabus = path.resolve(flagValue("--syllabus") ?? track.syllabus);
const datasetOverride = flagValue("--dataset");
const datasets = datasetOverride ? [path.resolve(datasetOverride)] : [...track.datasets];
const missing = [syllabus, ...datasets.map((dataset) => path.resolve(dataset))]
  .filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error(`ERROR: required syllabus/dataset file(s) are missing:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
if (!fs.existsSync(tsxCli)) {
  console.error("ERROR: local tsx CLI was not found.");
  process.exit(1);
}

for (const dataset of datasets) {
  console.log(`\n===== ${dataset}${dryRun ? " (dry run)" : ""} =====`);
  const args = [tsxCli, "scripts/import-questions.ts", "--dataset", dataset, "--syllabus", syllabus];
  if (dryRun) args.push("--dry-run");
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(`\nStopped: import failed for ${dataset} (exit ${result.status ?? "n/a"}).`);
    process.exit(result.status || 1);
  }
}
console.log(`\n${trackKey} datasets completed${dryRun ? " (dry run, no database write)" : ""}.`);
