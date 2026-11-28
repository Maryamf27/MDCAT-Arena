import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: ".env" });

type SLO = {
  id: string;
  text: string;
};

type Topic = {
  name: string;
  slos: SLO[];
};

type Unit = {
  // Some official unit identifiers are decimal strings (for example, "5.1").
  unit_number: number | string;
  title: string;
  topics: Topic[];
};

type SyllabusSubject = {
  id: string;
  official_units: Unit[];
};

type SyllabusFile = {
  subjects: SyllabusSubject[];
};

type SyllabusNode = {
  subject_id: string;
  parent_id: string | null;
  node_type: "unit" | "topic" | "slo";
  title: string;
  content: string | null;
  source_identifier: string | null;
  source_path: string;
  sort_order: number;
  metadata: Record<string, unknown>;
};

const SUBJECT_CODES: Record<string, string> = {
  biology: "BIO",
  chemistry: "CHEM",
  physics: "PHY",
  english: "ENG",
  logical_reasoning: "LR",
  ecat_mathematics: "ECAT_MATH",
  ecat_physics: "ECAT_PHY",
  ecat_chemistry: "ECAT_CHEM",
  ecat_english: "ECAT_ENG",
  nat_ie_english: "NAT_IE_ENG",
  nat_ie_analytical: "NAT_IE_ANALYTICAL",
  nat_ie_quantitative: "NAT_IE_QUANTITATIVE",
  nat_ie_physics: "NAT_IE_PHY",
  nat_ie_chemistry: "NAT_IE_CHEM",
  nat_ie_mathematics: "NAT_IE_MATH",
};

const BATCH_SIZE = 100;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const argv = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
const syllabusPath = path.resolve(flagValue("--syllabus") ?? "data/mdcat-syllabus.json");
const isDefaultMdcSyllabus = !flagValue("--syllabus");

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadSyllabus(): SyllabusFile {
  if (!fs.existsSync(syllabusPath)) {
    throw new Error(`Syllabus file not found: ${syllabusPath}`);
  }

  return JSON.parse(
    fs.readFileSync(syllabusPath, "utf-8")
  ) as SyllabusFile;
}

function validateSyllabus(data: SyllabusFile): void {
  if (!Array.isArray(data.subjects)) {
    throw new Error("Invalid syllabus: subjects must be an array.");
  }

  if (data.subjects.length === 0) {
    throw new Error("Syllabus must contain at least one subject.");
  }

  if (isDefaultMdcSyllabus && data.subjects.length !== 5) {
    throw new Error(
      `Expected 5 subjects, received ${data.subjects.length}.`
    );
  }

  const subjectIds = new Set<string>();

  for (const subject of data.subjects) {
    if (!SUBJECT_CODES[subject.id]) {
      throw new Error(`Unknown subject ID: ${subject.id}`);
    }

    if (subjectIds.has(subject.id)) {
      throw new Error(`Duplicate subject: ${subject.id}`);
    }

    subjectIds.add(subject.id);

    if (!Array.isArray(subject.official_units)) {
      throw new Error(
        `Invalid official_units for ${subject.id}`
      );
    }

    const unitIdentifiers = new Set<string>();

    for (const unit of subject.official_units) {
      const unitIdentifier = String(unit.unit_number ?? "").trim();

      if (
        !unitIdentifier ||
        (typeof unit.unit_number === "number" &&
          !Number.isFinite(unit.unit_number)) ||
        !unit.title ||
        !Array.isArray(unit.topics)
      ) {
        throw new Error(
          `Invalid unit in subject ${subject.id}: ${unitIdentifier || "(missing identifier)"}`
        );
      }

      if (unitIdentifiers.has(unitIdentifier)) {
        throw new Error(
          `Duplicate unit identifier "${unitIdentifier}" in subject ${subject.id}`
        );
      }

      unitIdentifiers.add(unitIdentifier);

      const topicSlugs = new Set<string>();

      for (const topic of unit.topics) {
        if (!topic.name || !Array.isArray(topic.slos)) {
          throw new Error(
            `Invalid topic in ${subject.id}, unit ${unitIdentifier}`
          );
        }

        const slug = slugify(topic.name);

        if (!slug) {
          throw new Error(
            `Topic has an empty generated slug: ${topic.name}`
          );
        }

        if (topicSlugs.has(slug)) {
          throw new Error(
            `Duplicate topic slug "${slug}" in ${subject.id}, unit ${unitIdentifier}`
          );
        }

        topicSlugs.add(slug);

        const sloIds = new Set<string>();

        for (const slo of topic.slos) {
          if (!slo.id || !slo.text) {
            throw new Error(
              `Invalid SLO in topic "${topic.name}"`
            );
          }

          if (sloIds.has(slo.id)) {
            throw new Error(
              `Duplicate SLO ID "${slo.id}" in topic "${topic.name}"`
            );
          }

          sloIds.add(slo.id);
        }
      }
    }
  }
}

function buildSourcePath(
  subjectId: string,
  unitNumber: number | string,
  topicSlug?: string,
  sloId?: string
): string {
  let result = `${subjectId}/unit/${encodeURIComponent(String(unitNumber))}`;

  if (topicSlug) {
    result += `/topic/${topicSlug}`;
  }

  if (sloId) {
    result += `/slo/${encodeURIComponent(sloId)}`;
  }

  return result;
}

async function upsertNodes(
  nodes: SyllabusNode[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from("syllabus_nodes")
      .upsert(batch, {
        onConflict: "subject_id,source_path",
      })
      .select("id, source_path");

    if (error) {
      throw new Error(`Syllabus import failed: ${error.message}`);
    }

    for (const node of data ?? []) {
      result.set(node.source_path, node.id);
    }

    console.log(
      `Imported/upserted ${Math.min(i + batch.length, nodes.length)} / ${nodes.length}`
    );
  }

  return result;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const syllabus = loadSyllabus();

  validateSyllabus(syllabus);

  const { data: subjects, error } = await supabase
    .from("subjects")
    .select("id, code");

  if (error) {
    throw new Error(`Could not fetch subjects: ${error.message}`);
  }

  const subjectMap = new Map(
    (subjects ?? []).map((subject) => [
      subject.code,
      subject.id,
    ])
  );

  const counts = {
    units: 0,
    topics: 0,
    slos: 0,
  };

  const allPaths = new Set<string>();

  function registerPath(sourcePath: string) {
    if (allPaths.has(sourcePath)) {
      throw new Error(`Duplicate source_path: ${sourcePath}`);
    }

    allPaths.add(sourcePath);
  }

  for (const subject of syllabus.subjects) {
    const code = SUBJECT_CODES[subject.id];
    const databaseSubjectId = subjectMap.get(code);

    if (!databaseSubjectId) {
      throw new Error(
        `Subject ${code} is missing from the subjects table.`
      );
    }

    for (const unit of subject.official_units) {
      registerPath(
        buildSourcePath(databaseSubjectId, unit.unit_number)
      );

      counts.units++;

      for (const topic of unit.topics) {
        registerPath(
          buildSourcePath(
            databaseSubjectId,
            unit.unit_number,
            slugify(topic.name)
          )
        );

        counts.topics++;

        for (const slo of topic.slos) {
          registerPath(
            buildSourcePath(
              databaseSubjectId,
              unit.unit_number,
              slugify(topic.name),
              slo.id
            )
          );

          counts.slos++;
        }
      }
    }
  }

  console.log("\nSyllabus validation successful.");
  console.table(counts);

  const totalNodes = counts.units + counts.topics + counts.slos;

  console.log(`Total official nodes: ${totalNodes}`);

  if (dryRun) {
    console.log("\nDRY RUN: No database records were modified.");
    return;
  }

  // Import units first.
  const unitNodes: SyllabusNode[] = [];

  for (const subject of syllabus.subjects) {
    const databaseSubjectId = subjectMap.get(
      SUBJECT_CODES[subject.id]
    )!;

    subject.official_units.forEach((unit, unitIndex) => {
      unitNodes.push({
        subject_id: databaseSubjectId,
        parent_id: null,
        node_type: "unit",
        title: unit.title,
        content: null,
        source_identifier: null,
        source_path: buildSourcePath(
          databaseSubjectId,
          unit.unit_number
        ),
        // sort_order is an integer; the original identifier stays in source_path.
        sort_order: unitIndex + 1,
        metadata: {
          official_unit_number: String(unit.unit_number),
        },
      });
    });
  }

  const unitIds = await upsertNodes(unitNodes);

  // Import topics after units.
  const topicNodes: SyllabusNode[] = [];

  for (const subject of syllabus.subjects) {
    const databaseSubjectId = subjectMap.get(
      SUBJECT_CODES[subject.id]
    )!;

    for (const unit of subject.official_units) {
      const unitPath = buildSourcePath(
        databaseSubjectId,
        unit.unit_number
      );

      const unitId = unitIds.get(unitPath);

      if (!unitId) {
        throw new Error(`Unit ID not found: ${unitPath}`);
      }

      unit.topics.forEach((topic, index) => {
        topicNodes.push({
          subject_id: databaseSubjectId,
          parent_id: unitId,
          node_type: "topic",
          title: topic.name,
          content: null,
          source_identifier: null,
          source_path: buildSourcePath(
            databaseSubjectId,
            unit.unit_number,
            slugify(topic.name)
          ),
          sort_order: index + 1,
          metadata: {},
        });
      });
    }
  }

  const topicIds = await upsertNodes(topicNodes);

  // Import SLOs after topics.
  const sloNodes: SyllabusNode[] = [];

  for (const subject of syllabus.subjects) {
    const databaseSubjectId = subjectMap.get(
      SUBJECT_CODES[subject.id]
    )!;

    for (const unit of subject.official_units) {
      for (const topic of unit.topics) {
        const topicPath = buildSourcePath(
          databaseSubjectId,
          unit.unit_number,
          slugify(topic.name)
        );

        const topicId = topicIds.get(topicPath);

        if (!topicId) {
          throw new Error(`Topic ID not found: ${topicPath}`);
        }

        topic.slos.forEach((slo, index) => {
          sloNodes.push({
            subject_id: databaseSubjectId,
            parent_id: topicId,
            node_type: "slo",
            title: `SLO ${slo.id}`,
            content: slo.text,
            source_identifier: slo.id,
            source_path: buildSourcePath(
              databaseSubjectId,
              unit.unit_number,
              slugify(topic.name),
              slo.id
            ),
            sort_order: index + 1,
            metadata: {},
          });
        });
      }
    }
  }

  await upsertNodes(sloNodes);

  console.log("\nSyllabus import completed successfully.");
  console.table(counts);
  console.log(`Total imported/upserted: ${totalNodes} nodes.`);
}

main().catch((error: unknown) => {
  console.error("\nImport failed:");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
});
