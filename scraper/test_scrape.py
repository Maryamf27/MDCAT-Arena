
import json
from pathlib import Path

from selenium import webdriver
from bs4 import BeautifulSoup

URL = "https://gotest.com.pk/biology-mcqs/biology-enzymes-online-mcqs-test/"

driver = webdriver.Chrome()

try:
    driver.get(URL)

    input("Page loaded. Press Enter after checking the MCQs...")

    soup = BeautifulSoup(driver.page_source, "html.parser")

    questions = []

    for container in soup.select(".watu-question"):
        question = container.select_one(".question-content")

        if not question:
            continue

        options = [
            item.get_text(" ", strip=True)
            for item in container.select(
                ".question-choices .watupro-question-choice label"
            )
        ]

        questions.append({
            "question": question.get_text(" ", strip=True),
            "options": options
        })

    print(f"Extracted {len(questions)} questions.")

    for i, q in enumerate(questions, 1):
        print(f"\n{i}. {q['question']}")
        for j, option in enumerate(q["options"]):
            print(f"   {chr(65+j)}. {option}")

    input("\nReveal an answer and explanation in Chrome, then press Enter...")

    result_soup = BeautifulSoup(driver.page_source, "html.parser")

    results = []

    for container in result_soup.select(".show-question"):
        question_element = container.select_one(".show-question-content")

        if not question_element:
            continue

        options = []
        correct_answer = None

        for item in container.select(".show-question-choices li.answer"):
            answer_element = item.select_one("span.answer")

            if not answer_element:
                continue

            text = answer_element.get_text(" ", strip=True)
            options.append(text)

            classes = item.get("class") or []

            if "correct-answer" in classes:
                correct_answer = text

        explanation_element = container.select_one(
            ".watupro-main-feedback"
        )

        explanation = (
            explanation_element.get_text(" ", strip=True)
            if explanation_element else None
        )

        results.append({
            "question": question_element.get_text(" ", strip=True),
            "options": options,
            "correct_answer": correct_answer,
            "explanation": explanation
        })

    output = Path("scraper/output")
    output.mkdir(parents=True, exist_ok=True)

    with open(output / "gotest-sample.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nExtracted answer results: {len(results)}")
    print("Saved: scraper/output/gotest-sample.json")

finally:
    driver.quit()
