import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options


SCRAPER_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRAPER_DIR.parent
SOURCE_CONFIG_PATH = SCRAPER_DIR / "sources" / "biology.json"
SYLLABUS_PATH = PROJECT_DIR / "data" / "mdcat-syllabus.json"
REPORT_PATH = SCRAPER_DIR / "reports" / "biology-source-audit.json"
USER_AGENT = "MDCATArenaSourceAudit/1.0"
PAGE_LOAD_TIMEOUT_SECONDS = 20
BETWEEN_PAGE_DELAY_SECONDS = 1.5

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "based", "be", "by", "can", "for",
    "from", "how", "in", "into", "is", "it", "of", "on", "or", "that", "the",
    "their", "these", "this", "to", "using", "was", "what", "which", "with",
    "account", "classify", "compare", "correlate", "define", "describe",
    "discuss", "explain", "give", "identify", "outline", "state",
}
COMMON_BIOLOGY_TERMS = {
    "activity", "biological", "body", "cell", "cause", "different", "effect",
    "energy", "factor", "function", "human", "important", "life", "molecule",
    "organ", "organism", "process", "rate", "reaction", "role", "structure",
    "substance", "system", "type",
}
DISTINCTIVE_TERMS = {"aids", "dna", "hiv", "rna"}

ACCESS_GATE_MARKERS = (
    "captcha",
    "verify you are human",
    "access denied",
    "log in to continue",
    "login to continue",
)
def load_inputs():
    config = json.loads(SOURCE_CONFIG_PATH.read_text(encoding="utf-8"))
    syllabus = json.loads(SYLLABUS_PATH.read_text(encoding="utf-8"))
    subject = next(
        (item for item in syllabus["subjects"] if item["id"] == "biology"),
        None,
    )
    if subject is None:
        raise ValueError("Biology is missing from the official syllabus.")
    if config.get("subject_id") != "biology":
        raise ValueError("The source configuration is not for Biology.")

    sources = config.get("source_inventory")
    if not isinstance(sources, list):
        raise ValueError("Biology source_inventory must be a list.")
    urls = [source.get("source_url") for source in sources]
    if any(not isinstance(url, str) or not url for url in urls):
        raise ValueError("Every Biology source must have a source_url.")
    if len(urls) != len(set(urls)):
        raise ValueError("Biology source_inventory contains duplicate URLs.")
    if any(urlparse(url).hostname != "gotest.com.pk" for url in urls):
        raise ValueError("Only the configured GoTest host is allowed.")
    return sources, subject["official_units"]


def check_robots(url, cache):
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    if robots_url not in cache:
        request = Request(robots_url, headers={"User-Agent": USER_AGENT})
        try:
            with urlopen(request, timeout=10) as response:
                body = response.read().decode("utf-8", errors="replace")
            parser = RobotFileParser()
            parser.set_url(robots_url)
            parser.parse(body.splitlines())
            cache[robots_url] = parser
        except (URLError, TimeoutError, OSError) as error:
            cache[robots_url] = error

    result = cache[robots_url]
    if isinstance(result, Exception):
        return False, f"Could not verify robots.txt ({type(result).__name__}); skipped."
    if not result.can_fetch(USER_AGENT, url):
        return False, "robots.txt disallows this URL; skipped."
    return True, None


def normalize_term(term):
    if len(term) > 5 and term.endswith("ies"):
        return term[:-3] + "y"
    if len(term) > 6 and term.endswith("uses"):
        return term[:-2]
    if len(term) > 6 and term.endswith("sses"):
        return term[:-2]
    if len(term) > 6 and term.endswith("ses"):
        return term[:-1]
    if len(term) > 4 and term.endswith("ing"):
        return term[:-3]
    if len(term) > 4 and term.endswith("ed"):
        return term[:-2]
    if len(term) > 4 and term.endswith("s"):
        return term[:-1]
    return term


def terms(text):
    return {
        normalize_term(token)
        for token in re.findall(r"[a-z0-9]+", text.lower())
        if token not in STOP_WORDS and len(token) > 1
    }


def normalized_phrase(text):
    return " ".join(
        normalize_term(token)
        for token in re.findall(r"[a-z0-9]+", text.lower())
        if token not in STOP_WORDS
    )


def compare_question(question_text, options, units):
    stem_terms = terms(question_text)
    all_terms = terms(" ".join([question_text, *options]))
    stem_phrase = normalized_phrase(question_text)
    strong_matches = []
    possible_matches = []

    for unit in units:
        for topic in unit["topics"]:
            topic_terms = terms(topic["name"])
            topic_phrase = normalized_phrase(topic["name"])
            topic_stem_hits = topic_terms & stem_terms
            topic_all_hits = topic_terms & all_terms
            phrase_match = bool(topic_phrase and topic_phrase in stem_phrase)
            topic_strong_matches = []
            topic_possible_matches = []
            for slo in topic["slos"]:
                slo_terms = terms(slo["text"])
                slo_stem_hits = slo_terms & stem_terms
                slo_all_hits = slo_terms & all_terms
                specific_slo_hits = slo_stem_hits - COMMON_BIOLOGY_TERMS
                match = {
                    "unit_number": unit["unit_number"],
                    "topic_name": topic["name"],
                    "slo_id": slo["id"],
                }
                if (
                    (phrase_match and specific_slo_hits)
                    or (
                        bool(topic_stem_hits)
                        and len(specific_slo_hits) >= 2
                    )
                    or bool(topic_stem_hits & DISTINCTIVE_TERMS)
                ):
                    topic_strong_matches.append(match)
                elif topic_stem_hits or slo_stem_hits or (
                    topic_all_hits and slo_all_hits
                ):
                    topic_possible_matches.append(match)

            if topic_strong_matches:
                strong_matches.extend(topic_strong_matches)
            elif phrase_match:
                strong_matches.append({
                    "unit_number": unit["unit_number"],
                    "topic_name": topic["name"],
                    "slo_id": None,
                })
            else:
                possible_matches.extend(topic_possible_matches)

    if strong_matches:
        unique = {
            (match["unit_number"], match["topic_name"], match["slo_id"]): match
            for match in strong_matches
        }
        return "relevant", list(unique.values()), []
    if possible_matches:
        unique = {
            (match["unit_number"], match["topic_name"], match["slo_id"]): match
            for match in possible_matches
        }
        return "uncertain", [], list(unique.values())
    return "unrelated", [], []


def access_gate_error(soup):
    visible_text = soup.get_text(" ", strip=True).lower()
    if any(marker in visible_text for marker in ACCESS_GATE_MARKERS):
        return "Possible access gate detected; no attempt was made to bypass it."
    return None


def inspect_page(driver, source, units):
    url = source["source_url"]
    errors = []
    try:
        driver.get(url)
    except TimeoutException:
        errors.append("Page load timed out; inspected the available page content.")
        try:
            driver.execute_script("window.stop();")
        except WebDriverException:
            return empty_page_result(source, errors + ["Browser could not stop timed-out navigation."])
    except WebDriverException as error:
        return empty_page_result(
            source,
            [f"Browser navigation failed ({type(error).__name__})."],
        )

    time.sleep(0.5)
    try:
        soup = BeautifulSoup(driver.page_source, "html.parser")
    except WebDriverException as error:
        return empty_page_result(
            source,
            errors + [f"Could not read the rendered page ({type(error).__name__})."],
        )

    gate_error = access_gate_error(soup)
    if gate_error:
        return empty_page_result(source, errors + [gate_error])

    containers = soup.select(".watu-question")
    if not containers:
        errors.append("No question containers found with the existing scraper selector.")

    question_evidence = []
    answer_key_count = 0
    explanation_count = 0
    for question_index, container in enumerate(containers, start=1):
        question = container.select_one(".question-content")
        if question is None:
            errors.append(f"Question container {question_index} has no question element.")
            continue

        question_text = question.get_text(" ", strip=True)
        options = [
            item.get_text(" ", strip=True)
            for item in container.select(
                ".question-choices .watupro-question-choice label"
            )
        ]
        if not question_text:
            errors.append(f"Question container {question_index} has empty question text.")
            continue

        mapping_status, matches, uncertain = compare_question(
            question_text,
            options,
            units,
        )
        answer_key_count += bool(
            container.select_one(".show-question-choices li.correct-answer")
        )
        explanation_count += bool(container.select_one(".watupro-main-feedback"))

        question_evidence.append({
            "question_index": question_index,
            "options_count": len(options),
            "classification": mapping_status,
            "matched_topics": [
                {
                    "unit_number": match["unit_number"],
                    "topic_name": match["topic_name"],
                }
                for match in matches
            ],
            "matched_slo_ids": sorted({
                match["slo_id"]
                for match in matches
                if match["slo_id"] is not None
            }),
            "uncertain_candidates": [
                {
                    "unit_number": match["unit_number"],
                    "topic_name": match["topic_name"],
                    "slo_id": match["slo_id"],
                }
                for match in uncertain
            ],
            "evidence_note": {
                "relevant": "Topic-specific vocabulary overlapped with official SLO wording.",
                "uncertain": "Some syllabus vocabulary overlapped; the match needs human review.",
                "unrelated": "No meaningful syllabus-term overlap was detected.",
            }[mapping_status],
        })

    statuses = [item["classification"] for item in question_evidence]
    relevant = statuses.count("relevant")
    unrelated = statuses.count("unrelated")
    uncertain = statuses.count("uncertain")
    if not statuses or errors:
        page_status = "pending"
    elif relevant == len(statuses):
        page_status = "verified"
    elif unrelated == len(statuses):
        page_status = "unmapped"
    else:
        page_status = "pending"

    return {
        "source_url": url,
        "chapter_group": source.get("chapter_group"),
        "mapping_status": page_status,
        "questions_inspected": len(question_evidence),
        "relevant_questions": relevant,
        "unrelated_questions": unrelated,
        "uncertain_questions": uncertain,
        "matched_official_topics": aggregate_topics(question_evidence),
        "matched_slo_ids": sorted({
            slo_id
            for item in question_evidence
            for slo_id in item["matched_slo_ids"]
        }),
        "uncertain_mappings": [
            {
                "question_index": item["question_index"],
                "candidates": item["uncertain_candidates"],
            }
            for item in question_evidence
            if item["classification"] == "uncertain"
        ],
        "question_evidence": question_evidence,
        "answer_keys_visible_without_interaction": answer_key_count,
        "explanations_visible_without_interaction": explanation_count,
        "extraction_errors": errors,
    }


def empty_page_result(source, errors):
    return {
        "source_url": source["source_url"],
        "chapter_group": source.get("chapter_group"),
        "mapping_status": "pending",
        "questions_inspected": 0,
        "relevant_questions": 0,
        "unrelated_questions": 0,
        "uncertain_questions": 0,
        "matched_official_topics": [],
        "matched_slo_ids": [],
        "uncertain_mappings": [],
        "question_evidence": [],
        "answer_keys_visible_without_interaction": 0,
        "explanations_visible_without_interaction": 0,
        "extraction_errors": errors,
    }


def aggregate_topics(question_evidence):
    topics = {}
    for question in question_evidence:
        for match in question["matched_topics"]:
            key = (match["unit_number"], match["topic_name"])
            topics.setdefault(key, set()).add(question["question_index"])
    return [
        {
            "unit_number": unit_number,
            "topic_name": topic_name,
            "question_indices": sorted(indices),
        }
        for (unit_number, topic_name), indices in sorted(
            topics.items(),
            key=lambda item: (str(item[0][0]), item[0][1]),
        )
    ]


def summarize_topic_mappings(units, pages):
    summary = []
    for unit in units:
        for topic in unit["topics"]:
            key = (unit["unit_number"], topic["name"])
            matched_questions = []
            uncertain_questions = []
            matched_slo_ids = set()
            for page in pages:
                for question in page["question_evidence"]:
                    if question["classification"] == "relevant":
                        if any(
                            (match["unit_number"], match["topic_name"]) == key
                            for match in question["matched_topics"]
                        ):
                            matched_questions.append({
                                "source_url": page["source_url"],
                                "question_index": question["question_index"],
                            })
                            matched_slo_ids.update(question["matched_slo_ids"])
                    elif question["classification"] == "uncertain":
                        if any(
                            (candidate["unit_number"], candidate["topic_name"]) == key
                            for candidate in question["uncertain_candidates"]
                        ):
                            uncertain_questions.append({
                                "source_url": page["source_url"],
                                "question_index": question["question_index"],
                            })
            summary.append({
                "unit_number": unit["unit_number"],
                "topic_name": topic["name"],
                "mapping_status": (
                    "pending"
                    if matched_questions or uncertain_questions
                    else "not_found"
                ),
                "candidate_question_count": len(matched_questions),
                "uncertain_question_count": len(uncertain_questions),
                "matched_slo_ids": sorted(matched_slo_ids),
            })
    return summary


def main():
    sources, official_units = load_inputs()
    robots_cache = {}
    report_pages = []
    permitted_sources = []

    for source in sources:
        allowed, error = check_robots(source["source_url"], robots_cache)
        if allowed:
            permitted_sources.append(source)
        else:
            report_pages.append(empty_page_result(source, [error]))

    if permitted_sources:
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument(f"--user-agent={USER_AGENT}")
        driver = None
        audited_urls = set()
        try:
            driver = webdriver.Chrome(options=options)
            driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT_SECONDS)
            for index, source in enumerate(permitted_sources):
                report_pages.append(inspect_page(driver, source, official_units))
                audited_urls.add(source["source_url"])
                if index + 1 < len(permitted_sources):
                    time.sleep(BETWEEN_PAGE_DELAY_SECONDS)
        except WebDriverException as error:
            for source in permitted_sources:
                if source["source_url"] in audited_urls:
                    continue
                report_pages.append(empty_page_result(
                    source,
                    [f"Could not initialize or continue Selenium ({type(error).__name__})."],
                ))
        finally:
            if driver is not None:
                driver.quit()

    source_order = {source["source_url"]: index for index, source in enumerate(sources)}
    report_pages.sort(key=lambda page: source_order[page["source_url"]])
    totals = {
        "sources_audited": len(report_pages),
        "questions_inspected": sum(page["questions_inspected"] for page in report_pages),
        "relevant_questions": sum(page["relevant_questions"] for page in report_pages),
        "unrelated_questions": sum(page["unrelated_questions"] for page in report_pages),
        "uncertain_questions": sum(page["uncertain_questions"] for page in report_pages),
    }
    report = {
        "audit_scope": "Biology only",
        "syllabus_source": "PM&DC MDCAT 2025",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "content_policy": (
            "Question text, options, answers, and explanations are not persisted. "
            "No answers were submitted or revealed."
        ),
        "matching_method": (
            "Question and option text was compared in memory with official Biology "
            "topics and SLOs. Lexical matches are evidence for review, not a substitute "
            "for expert verification."
        ),
        "totals": totals,
        "topic_mapping_summary": summarize_topic_mappings(
            official_units,
            report_pages,
        ),
        "sources": report_pages,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(
        "Biology source audit: "
        f"{totals['sources_audited']} sources, "
        f"{totals['questions_inspected']} questions inspected, "
        f"{totals['relevant_questions']} relevant, "
        f"{totals['unrelated_questions']} unrelated, "
        f"{totals['uncertain_questions']} uncertain."
    )
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
