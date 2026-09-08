# Big Five ingestion

Kleos stores BigFive-Test assessments as dated raw numeric evidence.

## Canonical source fields

Each assessment contains only:

- the date the BigFive-Test report says the test was taken;
- 5 domain scores;
- 30 facet scores.

Do not store prose interpretations, report descriptions, result IDs, or PDF metadata.

The `test_date` is authoritative. Never substitute the PDF creation/export date, download date, upload date, file-modified date, source-retrieval date, or the current import date.

## Intended ChatGPT workflow

1. The user uploads a BigFive-Test PDF.
2. Extract the report's actual test date.
3. Extract all 5 domain scores and all 30 facet scores.
4. Verify every score is present and mapped to the correct domain.
5. Write the structured payload through the privileged Supabase path:

```sql
select public.insert_kleos_big_five_assessment_admin(
  '{
    "test_date": "2024-03-06",

    "neuroticism_score": 0,
    "anxiety_score": 0,
    "anger_score": 0,
    "depression_score": 0,
    "self_consciousness_score": 0,
    "immoderation_score": 0,
    "vulnerability_score": 0,

    "extraversion_score": 0,
    "friendliness_score": 0,
    "gregariousness_score": 0,
    "assertiveness_score": 0,
    "activity_level_score": 0,
    "excitement_seeking_score": 0,
    "cheerfulness_score": 0,

    "openness_score": 0,
    "imagination_score": 0,
    "artistic_interests_score": 0,
    "emotionality_score": 0,
    "adventurousness_score": 0,
    "intellect_score": 0,
    "liberalism_score": 0,

    "agreeableness_score": 0,
    "trust_score": 0,
    "morality_score": 0,
    "altruism_score": 0,
    "cooperation_score": 0,
    "modesty_score": 0,
    "sympathy_score": 0,

    "conscientiousness_score": 0,
    "self_efficacy_score": 0,
    "orderliness_score": 0,
    "dutifulness_score": 0,
    "achievement_striving_score": 0,
    "self_discipline_score": 0,
    "cautiousness_score": 0
  }'::jsonb
);
```

Replace the placeholder zeroes with the raw scores shown in the report. Do not normalize or reinterpret them.

The function is deliberately unavailable to public, anonymous, authenticated-client, and service-role API callers. It is intended for the connected privileged ChatGPT/Supabase SQL path. The normal Kleos UI can also create assessments for the authorized user under row-level security.

## History semantics

Every import inserts a new row. A later assessment never overwrites an earlier one, even if the scores differ. Multiple records on the same date are permitted because separate tests may legitimately occur on the same day.
