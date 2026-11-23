# `questions` table: schema, UUID resolution, and RLS

Status: **reconciled for the existing legacy table; not run**. The migration (`supabase/migrations/20261123000000_create_questions.sql`) does not create/drop `public.questions`. It preserves the 15 existing columns and rows, inspects the `syllabus_node_id` FK and referenced node types, and adds normalized question/provenance/syllabus fields. Existing constraints, RLS policies, table grants, and RLS settings are left in place.

## 1. What the repo actually contains

- `public.questions` already exists in Supabase with these 15 columns: `id`, `subject_id`, `syllabus_node_id`, `question_text`, `options`, `correct_answer_index`, `explanation`, `difficulty`, `source_name`, `source_url`, `content_hash`, `status`, `created_by`, `created_at`, and `updated_at`.
- The migration retains those fields, backfills `question` from `question_text`, combines the legacy source name and URL into `source_reference`, and labels legacy provenance `source_type = 'legacy'` because those columns do not establish whether the question was copied or independently authored. `content_hash` and `status` remain untouched; the new `question_hash` is calculated from normalized question text and `is_active` is derived from recognized active status values.
- The migration prints the actual FK definition and counts of referenced `node_type` values. It maps an existing unit/topic/SLO reference through the real parent chain and canonical paths; if a legacy node has zero or multiple SLO resolutions, it aborts rather than guessing.
- `subjects` and `syllabus_nodes` were created outside version control, so their shape below is **inferred from `scripts/import-syllabus.ts`** and `lib/supabase/*`.

### `subjects` (inferred)
| column | notes |
|---|---|
| `id` | uuid (assumed) |
| `code` | `BIO`, `CHEM`, `PHY`, `ENG`, `LR`. Importer maps syllabus ids to these. |

Other columns may exist but are unknown.

### `syllabus_nodes` (inferred)
| column | notes |
|---|---|
| `id` | uuid, returned by the importer's upsert |
| `subject_id` | FK to `subjects.id` |
| `parent_id` | null for units; unit id for topics; topic id for SLOs |
| `node_type` | `unit`, `topic`, `slo` (text or enum, unknown) |
| `title`, `content`, `sort_order`, `metadata` | `content` holds SLO text |
| `source_identifier` | SLO id such as `3.9`; null for units and topics |
| `source_path` | unique with `subject_id` (importer `onConflict`) |

Hierarchy: `subject -> unit -> topic -> slo`.

Syllabus size: 239 topics; 326 SLOs (Biology 69, Chemistry 120, Physics 100, English 21, Logical Reasoning 16). SLO ids are unique within each subject.

## 2. Canonical path to UUID resolution

The dataset uses canonical paths. The database stores the same path with the subject's **database UUID** in front:

| level | dataset | `syllabus_nodes.source_path` |
|---|---|---|
| unit | `biology/unit/3` | `<subjects.id>/unit/3` |
| topic | `biology/unit/3/topic/structure-of-dna` | `<subjects.id>/unit/3/topic/structure-of-dna` |
| SLO | `slo_reference: "3.9"` | matched by `source_identifier` under the topic |

The migration adds `resolve_question_syllabus_refs(subject_key, unit_path, topic_path, slo)`. It returns `subject_id, unit_id, topic_id, slo_node_id`, or zero rows if any link is missing. It is `service_role` only and no UUIDs are stored or assumed.

Checked offline: the TypeScript slugger (importer) and the Python slugger (validator) produce identical paths for all 239 topics, and all 5 sample topic ids are resolvable.

## 3. Proposed `questions` columns

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `question` | text | not blank |
| `options` | jsonb | exactly 4 non-empty strings |
| `correct_answer_index` | smallint | 0 to 3 (0-based, as in the dataset) |
| `explanation` | text | not blank |
| `subject_id` | uuid FK `subjects.id` | restrict |
| `unit_id` | uuid FK `syllabus_nodes.id` | restrict; must be a `unit` node |
| `topic_id` | uuid FK `syllabus_nodes.id` | restrict; must be a `topic` child of the unit |
| `slo_reference` | text | e.g. `3.9` |
| `difficulty` | text | `easy`, `medium`, `hard` |
| `source_type` | text | `original` for authored imports; `legacy` for migrated records whose source fields do not establish authorship |
| `source_reference` | text | not blank |
| `created_at` | timestamptz | default `now()` |

Additional normalized fields:
- `slo_node_id` uuid FK, so the SLO reference is a real foreign key. A trigger checks it matches `slo_reference`.
- `question_hash`, a unique md5 of normalized question text. Legacy `content_hash` remains unchanged.
- `is_active`, backfilled from `status`; existing rows with `active`, `approved`, `published`, `live`, or `enabled` are active, and other statuses are inactive. New rows default active.

Integrity that plain FKs cannot give is enforced by trigger `questions_validate_hierarchy`: node types, same subject, topic under unit, SLO under topic. It avoids adding a composite unique key to `syllabus_nodes`, so the syllabus table is untouched.

## 4. RLS and answer-key protection

The corrected migration deliberately does not enable/disable RLS, change grants, or create/drop policies on the existing table. This preserves the live access configuration. The following is the intended access model to compare with the policies already configured in Supabase; the migration does not install it.

1. `ENABLE` and `FORCE ROW LEVEL SECURITY`.
2. `REVOKE ALL` from `public`, `anon`, `authenticated`. Supabase's default privileges would otherwise grant them.
3. **Column-level `GRANT SELECT` to `authenticated`** on safe columns only: `id, question, options, subject_id, unit_id, topic_id, slo_node_id, slo_reference, difficulty, created_at`.
   Never granted: `correct_answer_index`, `explanation`, `source_type`, `source_reference`, `question_hash`, `is_active`. Because filtering needs SELECT on the column, clients also cannot probe answers with filters such as `?correct_answer_index=eq.0`.
4. Policy:

```sql
create policy questions_select_active_authenticated
  on public.questions for select to authenticated
  using (is_active);
```

5. No INSERT, UPDATE or DELETE policies and no write grants for clients. Only `service_role` writes.
6. Do not add `questions` to the `supabase_realtime` publication. Realtime ignores column privileges and could broadcast answers.
7. Client queries must list columns. `select('*')` fails with permission denied, which fails closed.

### Releasing answers after submission (not built yet)
This needs attempt tables that do not exist. Planned shape:
- A `SECURITY DEFINER` RPC, e.g. `submit_attempt(attempt_id, answers)`, with `set search_path = ''`.
- It verifies `auth.uid()` owns the attempt and that it is not already submitted, stores answers, marks the attempt submitted, scores it, and only then returns `correct_answer_index` and `explanation` for the questions in that attempt.
- Revoke execute from `anon` and `public`.

## 5. Unresolved items

1. **`subjects` and `syllabus_nodes` DDL is not in the repo.** Column types (uuid ids, `node_type` text vs enum) are inferred. The migration checks dependency columns and UUID id types before changing anything.
2. **Syllabus rows may not be imported yet.** It is unknown whether `import:syllabus` has been run against the live DB. Resolution returns zero rows until it has (expected 239 topics, 326 SLOs).
3. **Anonymous access:** I assumed only signed-in users read questions. Say if guests should take trials.
4. **No attempts or results tables or submission RPC yet** (section 4).
5. New authored imports use `source_type = 'original'` per the validator. Existing legacy rows are marked `legacy` because `source_name` and `source_url` do not prove authorship.
6. **Unit identifiers:** Logical Reasoning units are `5.1` to `5.6`, English units are 1 to 3, with the official number kept in `source_path` and `metadata.official_unit_number`. Dataset unit paths already use these official numbers, so no mapping gap.
7. **The corrected migration has not been executed against Postgres.** Its preflight verifies the supplied column layout and FK target. It reports the live referenced node types and rolls back if canonical path mapping is missing or ambiguous.
