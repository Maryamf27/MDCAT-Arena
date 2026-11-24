"""Build an importer-ready dataset from compact authoring files.

Authoring files live in scraper/authoring/<subject>/*.txt. Format:

    # comment
    @ 3.9                      <- official SLO id (selects subject/unit/topic)
    E|question|correct|distractor1|distractor2|distractor3|explanation
    M|...
    H|...

E/M/H = easy/medium/hard. The author writes the correct answer first; this
script deterministically places it at a balanced position (0-3) and records
the 0-based correct_answer_index. Nothing is imported anywhere.

Usage: python3 scraper/build_question_dataset.py biology
"""

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_question_dataset import (  # noqa: E402
    SYLLABUS_PATH, load_syllabus, topic_id, unit_id, validate_dataset,
)

SCRAPER_DIR = Path(__file__).resolve().parent
DIFF = {"E": "easy", "M": "medium", "H": "hard"}
SOURCE_REF = "MDCAT Arena original item; independently authored against PM&DC MDCAT 2025 syllabus SLO {slo}"


def slo_index(syllabus, subject_id):
    idx = {}
    for subject in syllabus["subjects"]:
        if subject["id"] != subject_id:
            continue
        for unit in subject["official_units"]:
            for topic in unit["topics"]:
                for slo in topic["slos"]:
                    idx[slo["id"]] = (
                        unit_id(subject_id, unit["unit_number"]),
                        topic_id(subject_id, unit["unit_number"], topic["name"]),
                    )
    return idx


def parse_authoring(subject_id, idx):
    problems, items = [], {}  # slo -> [(diff, q, correct, [d], expl, src)]
    files = sorted((SCRAPER_DIR / "authoring" / subject_id).glob("*.txt"))
    for path in files:
        current = None
        for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            where = f"{path.name}:{n}"
            if line.startswith("@"):
                current = line[1:].strip()
                if current not in idx:
                    problems.append(f"{where}: SLO '{current}' is not an official {subject_id} SLO")
                    current = None
                continue
            if current is None:
                problems.append(f"{where}: question line before a valid @ SLO header")
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 7 or parts[0] not in DIFF or not all(parts[1:]):
                problems.append(f"{where}: expected 'E|M|H|question|correct|d1|d2|d3|explanation' (7 non-empty fields)")
                continue
            items.setdefault(current, []).append(
                (DIFF[parts[0]], parts[1], parts[2], parts[3:6], parts[6], path.name)
            )
    return items, problems


def build(subject_id):
    syllabus = load_syllabus()
    idx = slo_index(syllabus, subject_id)
    items, problems = parse_authoring(subject_id, idx)
    questions = []
    for slo in sorted(items, key=lambda s: [int(x) for x in s.split(".")]):
        offset = int(hashlib.md5(f"{subject_id}:{slo}".encode()).hexdigest(), 16) % 4
        for i, (diff, q, correct, distractors, expl, _f) in enumerate(items[slo]):
            pos = (offset + i) % 4
            options = list(distractors)
            options.insert(pos, correct)
            u, t = idx[slo]
            questions.append({
                "question": q, "options": options, "correct_answer_index": pos,
                "explanation": expl, "subject": subject_id, "unit_id": u, "topic_id": t,
                "slo_reference": slo, "difficulty": diff, "source_type": "original",
                "source_reference": SOURCE_REF.format(slo=slo),
            })
    dataset = {
        "schema_version": 1,
        "reference_scheme": "subject/unit/{unit_number}/topic/{topic_slug}",
        "answer_index_base": 0,
        "questions": questions,
    }
    out = SCRAPER_DIR / "output" / subject_id / "authored-questions.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    errors = validate_dataset(dataset, syllabus)
    print(f"{subject_id}: parsed {sum(len(v) for v in items.values())} items for {len(items)} SLOs "
          f"-> {out.relative_to(SCRAPER_DIR.parent)}")
    print(f"authoring problems: {len(problems)}; validator errors: {len(errors)}")
    for p in problems + errors:
        print("  ", p)
    return 1 if (problems or errors) else 0


if __name__ == "__main__":
    sys.exit(build(sys.argv[1] if len(sys.argv) > 1 else "biology"))
