import json, sys
d = json.load(open("/home/claude/MDCAT-Arena-main/scraper/output/biology/authored-sample.json"))
out = ["insert into public.subjects (code,name) values ('BIO','Biology'),('CHEM','Chemistry'),('PHY','Physics'),('ENG','English'),('LR','Logical Reasoning');"]
q = lambda s: "'" + s.replace("'", "''") + "'"
for x in d["questions"]:
    out.append(f"insert into public.questions (subject_id, slo_reference, question, options, correct_answer_index, explanation, difficulty) values ((select id from public.subjects where code='BIO'), {q(x['slo_reference'])}, {q(x['question'])}, {q(json.dumps(x['options']))}::jsonb, {x['correct_answer_index']}, {q(x['explanation'])}, {q(x['difficulty'])});")
print("\n".join(out))
