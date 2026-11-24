"""Validate independently authored questions against the official syllabus."""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path


SCRAPER_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRAPER_DIR.parent
SYLLABUS_PATH = PROJECT_DIR / "data" / "mdcat-syllabus.json"
DEFAULT_DATASET_PATH = (
    SCRAPER_DIR / "output" / "biology" / "authored-sample.json"
)
REQUIRED_FIELDS = {
    "question",
    "options",
    "correct_answer_index",
    "explanation",
    "subject",
    "unit_id",
    "topic_id",
    "slo_reference",
    "difficulty",
    "source_type",
    "source_reference",
}
DIFFICULTIES = {"easy", "medium", "hard"}
SOURCE_TYPES = {"original"}


def slugify(value):
    normalized = unicodedata.normalize("NFKD", value)
    without_marks = "".join(
        character
        for character in normalized
        if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", "-", without_marks.lower()).strip("-")


def unit_id(subject_id, unit_number):
    return f"{subject_id}/unit/{unit_number}"


def topic_id(subject_id, unit_number, topic_name):
    return f"{unit_id(subject_id, unit_number)}/topic/{slugify(topic_name)}"


def load_syllabus(path=SYLLABUS_PATH):
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("subjects"), list):
        raise ValueError("Official syllabus must contain a subjects array.")
    return data


def build_syllabus_index(syllabus):
    subjects = {}
    units = {}
    topics = {}

    for subject in syllabus["subjects"]:
        subject_id = subject["id"]
        subjects[subject_id] = subject["name"]
        for unit in subject["official_units"]:
            current_unit_id = unit_id(subject_id, unit["unit_number"])
            units[current_unit_id] = subject_id
            for topic in unit["topics"]:
                current_topic_id = topic_id(
                    subject_id,
                    unit["unit_number"],
                    topic["name"],
                )
                topics[current_topic_id] = {
                    "subject_id": subject_id,
                    "unit_id": current_unit_id,
                    "slo_references": {slo["id"] for slo in topic["slos"]},
                }
    return subjects, units, topics


def normalize_question(question):
    normalized = unicodedata.normalize("NFKC", question).casefold()
    return " ".join(re.findall(r"\w+", normalized, flags=re.UNICODE))


ANSWER_POSITION_PHRASES = re.compile(
    r"\b(all of the above|none of the above|both [a-d] and [a-d]|"
    r"(options?|choices?) [a-d] (and|or|&) [a-d]|all of these|none of these|"
    r"neither of the above|both of the above)\b",
    re.IGNORECASE,
)


def _tokens(text):
    return set(re.findall(r"\w+", unicodedata.normalize("NFKC", text).casefold()))


def near_duplicate_pairs(questions, threshold=0.8):
    """Return (i, j, score) for stems whose word sets overlap heavily."""
    token_sets = [_tokens(q.get("question", "")) if isinstance(q, dict) else set() for q in questions]
    pairs = []
    for i in range(len(token_sets)):
        a = token_sets[i]
        if len(a) < 6:
            continue
        for j in range(i + 1, len(token_sets)):
            b = token_sets[j]
            if len(b) < 6:
                continue
            inter = len(a & b)
            if inter / len(a | b) >= threshold:
                pairs.append((i, j, round(inter / len(a | b), 2)))
    return pairs


def validate_dataset(dataset, syllabus):
    errors = []
    if not isinstance(dataset, dict):
        return ["Dataset root must be a JSON object."]
    if dataset.get("schema_version") != 1:
        errors.append("schema_version must be 1.")

    questions = dataset.get("questions")
    if not isinstance(questions, list):
        return errors + ["questions must be an array."]
    if not questions:
        errors.append("questions must contain at least one question.")

    subjects, units, topics = build_syllabus_index(syllabus)
    seen_questions = {}

    for index, item in enumerate(questions, start=1):
        location = f"questions[{index - 1}]"
        if not isinstance(item, dict):
            errors.append(f"{location} must be an object.")
            continue

        missing = sorted(REQUIRED_FIELDS - item.keys())
        if missing:
            errors.append(f"{location} is missing required fields: {', '.join(missing)}.")

        question = item.get("question")
        if not isinstance(question, str) or not question.strip():
            errors.append(f"{location}.question must be a non-empty string.")
        else:
            normalized = normalize_question(question)
            if normalized in seen_questions:
                errors.append(
                    f"{location}.question duplicates questions[{seen_questions[normalized]}]."
                )
            else:
                seen_questions[normalized] = index - 1

        options = item.get("options")
        if (
            not isinstance(options, list)
            or len(options) != 4
            or any(not isinstance(option, str) or not option.strip() for option in options)
        ):
            errors.append(f"{location}.options must contain exactly four non-empty strings.")

        elif len({" ".join(unicodedata.normalize("NFKC", option).casefold().split()) for option in options}) != 4:
            errors.append(f"{location}.options must be four distinct options.")
        elif any(ANSWER_POSITION_PHRASES.search(option) for option in options):
            errors.append(
                f"{location}.options must not use position-dependent phrases "
                "such as 'all of the above' or 'both A and B'."
            )

        answer_index = item.get("correct_answer_index")
        if type(answer_index) is not int or answer_index not in range(4):
            errors.append(f"{location}.correct_answer_index must be an integer from 0 to 3.")

        for field in ("explanation", "source_reference"):
            value = item.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{location}.{field} must be a non-empty string.")

        subject = item.get("subject")
        if not isinstance(subject, str) or subject not in subjects:
            errors.append(f"{location}.subject is not an official subject ID.")

        current_unit_id = item.get("unit_id")
        if not isinstance(current_unit_id, str) or current_unit_id not in units:
            errors.append(f"{location}.unit_id does not reference an official unit.")
        elif isinstance(subject, str) and units[current_unit_id] != subject:
            errors.append(f"{location}.unit_id belongs to a different subject.")

        current_topic_id = item.get("topic_id")
        if not isinstance(current_topic_id, str) or current_topic_id not in topics:
            errors.append(f"{location}.topic_id does not reference an official topic.")
        else:
            topic = topics[current_topic_id]
            if isinstance(subject, str) and topic["subject_id"] != subject:
                errors.append(f"{location}.topic_id belongs to a different subject.")
            if (
                isinstance(current_unit_id, str)
                and topic["unit_id"] != current_unit_id
            ):
                errors.append(f"{location}.topic_id does not belong to unit_id.")
            slo_reference = item.get("slo_reference")
            if (
                not isinstance(slo_reference, str)
                or slo_reference not in topic["slo_references"]
            ):
                errors.append(
                    f"{location}.slo_reference is not an SLO of the selected topic."
                )

        difficulty = item.get("difficulty")
        if not isinstance(difficulty, str) or difficulty not in DIFFICULTIES:
            errors.append(
                f"{location}.difficulty must be one of: {', '.join(sorted(DIFFICULTIES))}."
            )

        source_type = item.get("source_type")
        if not isinstance(source_type, str) or source_type not in SOURCE_TYPES:
            errors.append(
                f"{location}.source_type must be 'original'; external content "
                "requires a separately authorized workflow."
            )
        source_reference = item.get("source_reference")
        if isinstance(source_reference, str) and "gotest.com.pk" in source_reference.casefold():
            errors.append(f"{location}.source_reference cannot point to GoTest content.")

    for i, j, score in near_duplicate_pairs(questions):
        errors.append(
            f"questions[{i}] and questions[{j}] are near-duplicates (word overlap {score})."
        )

    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Validate an independently authored MCQ dataset against the official syllabus."
    )
    parser.add_argument(
        "dataset",
        nargs="?",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Dataset JSON path (defaults to the Biology authored sample).",
    )
    args = parser.parse_args(argv)

    try:
        dataset = json.loads(args.dataset.read_text(encoding="utf-8"))
        syllabus = load_syllabus()
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Validation could not run: {error}", file=sys.stderr)
        return 2

    errors = validate_dataset(dataset, syllabus)
    question_count = len(dataset.get("questions", [])) if isinstance(dataset, dict) else 0
    print(f"Dataset: {args.dataset}")
    print(f"Questions: {question_count}")
    print(f"Validation errors: {len(errors)}")
    for error in errors:
        print(f"  ERROR: {error}")
    if errors:
        return 1
    print("Validation result: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
