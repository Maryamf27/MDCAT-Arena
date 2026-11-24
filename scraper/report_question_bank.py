"""Progress/coverage report. Counts only questions that exist in the dataset files.

Usage: python3 scraper/report_question_bank.py [subject ...]
Writes scraper/reports/question-bank-progress.json
"""
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_question_dataset import load_syllabus, validate_dataset  # noqa: E402

SCRAPER_DIR = Path(__file__).resolve().parent
TARGET_PER_SLO = 10
SUBJECTS = ["biology", "chemistry", "physics", "english", "logical_reasoning"]


def _by_unit(qs):
    groups = {}
    for q in qs:
        groups.setdefault(q["unit_id"].rsplit("/", 1)[1], []).append(q)
    return groups


def report_subject(syllabus, subject_id):
    slos = []
    for s in syllabus["subjects"]:
        if s["id"] == subject_id:
            slos = [o["id"] for u in s["official_units"] for t in u["topics"] for o in t["slos"]]
    path = SCRAPER_DIR / "output" / subject_id / "authored-questions.json"
    if not path.exists():
        return {"dataset": None, "total_slos": len(slos), "questions": 0, "slos_with_any": 0,
                "slos_complete": 0, "target_questions": len(slos) * TARGET_PER_SLO}
    data = json.loads(path.read_text(encoding="utf-8"))
    qs = data["questions"]
    per_slo = Counter(q["slo_reference"] for q in qs)
    errors = validate_dataset(data, syllabus)
    longest = sum(1 for q in qs if len(q["options"][q["correct_answer_index"]]) == max(map(len, q["options"])))
    return {
        "dataset": str(path.relative_to(SCRAPER_DIR.parent)),
        "total_slos": len(slos),
        "target_questions": len(slos) * TARGET_PER_SLO,
        "questions": len(qs),
        "slos_with_any": sum(1 for s in slos if per_slo[s] > 0),
        "slos_complete": sum(1 for s in slos if per_slo[s] >= TARGET_PER_SLO),
        "slos_missing": [s for s in slos if per_slo[s] == 0],
        "slos_partial": {s: per_slo[s] for s in slos if 0 < per_slo[s] < TARGET_PER_SLO},
        "difficulty": dict(Counter(q["difficulty"] for q in qs)),
        "answer_positions": dict(sorted(Counter(q["correct_answer_index"] for q in qs).items())),
        "correct_is_longest_option_pct": round(100 * longest / max(1, len(qs)), 1),
        "explanation_words_median": statistics.median(len(q["explanation"].split()) for q in qs),
        "short_explanations_under_8_words": sum(1 for q in qs if len(q["explanation"].split()) < 8),
        "per_unit_quality": {
            u: {
                "questions": len(g),
                "explanation_words_median": statistics.median(len(q["explanation"].split()) for q in g),
                "correct_is_longest_pct": round(100 * sum(
                    1 for q in g if len(q["options"][q["correct_answer_index"]]) == max(map(len, q["options"]))
                ) / len(g), 1),
            }
            for u, g in sorted(_by_unit(qs).items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else kv[0])
        },
        "validation_errors": len(errors),
        "validation_error_samples": errors[:10],
    }


def main():
    syllabus = load_syllabus()
    wanted = sys.argv[1:] or SUBJECTS
    result = {s: report_subject(syllabus, s) for s in wanted}
    out = SCRAPER_DIR / "reports" / "question-bank-progress.json"
    prior = json.loads(out.read_text()) if out.exists() else {}
    prior.update(result)
    out.write_text(json.dumps(prior, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for s, r in result.items():
        print(f"{s}: {r['questions']}/{r['target_questions']} questions; "
              f"SLOs with any {r['slos_with_any']}/{r['total_slos']}, complete(10) {r['slos_complete']}; "
              f"validation errors {r.get('validation_errors', 'n/a')}")
        if r.get("slos_missing"):
            print("   missing SLOs:", ", ".join(r["slos_missing"]))
        if r.get("slos_partial"):
            print("   partial SLOs:", r["slos_partial"])


if __name__ == "__main__":
    main()
