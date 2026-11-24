# MDCAT Arena question bank: progress

Nothing has been imported into Supabase. No schema changes were made.

## Workflow (resumable)
1. Author compact items in `scraper/authoring/<subject>/*.txt` (`D|question|correct|d1|d2|d3|explanation`, under an `@ <SLO id>` header).
2. `python3 scraper/build_question_dataset.py <subject>` builds `scraper/output/<subject>/authored-questions.json`
   (maps to official unit/topic/SLO, places the correct answer at a balanced 0-based index, runs the validator).
3. `python3 scraper/report_question_bank.py [subject]` writes `scraper/reports/question-bank-progress.json`.

## Status
| Subject | Target | Written | SLOs with questions | Validator errors | Status |
|---|---|---|---|---|---|
| Biology | 690 | 690 | 69/69 | 0 | count-complete; **quality revision needed** (below) |
| Chemistry | 1200 | 0 | 0/120 | n/a | not started |
| Physics | 1000 | 0 | 0/100 | n/a | not started |
| English | 210 | 0 | 0/21 | n/a | not started |
| Logical Reasoning | 160 | 0 | 0/16 | n/a | not started |

## Known quality issues in Biology (not caught by the validator)
- Explanations: Units 1-4 median 11-17 words; Units 9-16 median 5-7 words. Many later explanations restate the answer rather than teach.
  316 of 690 are under 8 words.
- Answer-length cue: the correct option is the longest in about 69% of items (chance is about 25%). Distractors need lengthening/rebalancing.
- Difficulty labels in Units 9-16 are optimistic; several "hard" items are recall.
- No subject-matter expert review has happened. Facts are authored from standard textbook knowledge and should be checked.
