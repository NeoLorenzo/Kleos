# Kleos Psychological Battery

Kleos issue #35 adds a manually runnable, dated psychological assessment battery. Each completed run is canonical raw evidence for the `psychological` vector; it is not itself a vector score and the validated instruments are never combined into a homemade aggregate.

## Battery v1.0.0

The validated core contains 36 responses:

| Instrument | Items | Timeframe / interpretation | Kleos score |
| --- | ---: | --- | --- |
| WHO-5 Well-Being Index | 5 | Previous two weeks | Raw 0–25 and the standard raw × 4 percentage (0–100) |
| Satisfaction With Life Scale (SWLS) | 5 | Global life satisfaction | 5–35 |
| Perceived Stress Scale (PSS-10) | 10 | Previous month; use the official form's exact wording | 0–40, with items 4, 5, 7 and 8 reverse-scored |
| GAD-7 | 7 | Previous two weeks | 0–21 |
| PHQ-9 | 9 | Previous two weeks | 0–27; item 9 is also retained separately |

The flow then adds 11 Kleos-specific tracking items covering agency, task initiation, procrastination resistance, resilience, rumination control, self-respect, meaning/coherence, intrinsic motivation, psychological energy/burnout, guilt-free relaxation, and social connection/loneliness. These are explicitly **not validated subscales** and are stored individually on a stable 0–4 agreement scale.

## Wording, attribution, and licensing

Before implementation, the source/usage terms were checked for every validated instrument.

- **WHO-5:** use the WHO 2024 open-access republication and its exact English wording/scoring. WHO publishes that version under CC BY-NC-SA 3.0 IGO. Source: <https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01>
- **SWLS:** use the original five-item English scale and 1–7 response format. Ed Diener's official scale page permits non-commercial use with attribution. Source: <https://eddiener.com/satisfaction-with-life-scale-swls/>
- **PSS-10:** the public Kleos repository does **not** redistribute the exact item wording. Carnegie Mellon directs permission/access requests through Mapi Research Trust, and the distributed review-copy terms prohibit simply retyping/copying the scale into a public application source tree. The Kleos UI therefore provides ten numbered response slots and directs the owner to the official PSS source while preserving deterministic scoring. Source: <https://www.cmu.edu/dietrich/psychology/stress-immunity-disease-lab/scales/index.html>
- **GAD-7 / PHQ-9:** the Patient Health Questionnaire family states that no permission is required to reproduce, translate, display, or distribute the measures. Kleos preserves the established wording, response scale, and scoring. Sources: <https://www.phqscreeners.com/> and the NIH instrument catalog.

If redistribution authorization for PSS-10 is obtained later, the exact wording can be added in a follow-up without changing stored response keys or historical scoring semantics.

## Interpretation constraints

GAD-7 and PHQ-9 are screening measures, not diagnoses. PSS-10 has no diagnostic cut-off in Kleos. WHO-5's standard suggested low-wellbeing cut-off may be displayed as a screening/attention flag, never as a diagnosis.

PHQ-9 item 9 is treated specially: any value above zero produces an immediate safety notice in the assessment flow, while the numeric response remains part of the stored instrument result. Kleos does not infer diagnosis or risk level mechanically from that item.

## Persistence and evidence

`public.goat_psychological_assessments` stores:

- assessment timestamp;
- battery version and per-instrument version metadata;
- numeric item responses sufficient for deterministic rescoring;
- independent WHO-5, SWLS, PSS-10, GAD-7, and PHQ-9 totals;
- PHQ-9 item 9 separately;
- the 11 Kleos-specific facet responses;
- created/updated timestamps for correction history semantics.

The table uses the same owner-only authenticated RLS boundary as other Kleos measurements. New runs insert new rows; corrections edit a selected historical row, and deletion requires explicit confirmation.

The migration registers `goat_psychological_assessments` in `kleos_evidence_sources`. The registry-driven evidence endpoint therefore exposes it automatically under `evidence_groups` without adding another hard-coded evidence-group list.
