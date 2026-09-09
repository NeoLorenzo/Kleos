# Kleos Psychological Battery

Kleos provides a manually runnable, dated psychological assessment battery. Each completed run is canonical raw evidence for the `psychological` vector; it is not itself a vector score and the validated instruments are never combined into a homemade aggregate.

## Battery v1.1.0

PSS-10 has been removed entirely from the active battery and persistence model because Kleos should not depend on questionnaire content with redistribution/licensing constraints.

The validated core now contains 26 responses:

| Instrument | Items | Timeframe / interpretation | Kleos score |
| --- | ---: | --- | --- |
| WHO-5 Well-Being Index | 5 | Previous two weeks | Raw 0–25 and the standard raw × 4 percentage (0–100) |
| Satisfaction With Life Scale (SWLS) | 5 | Global life satisfaction | 5–35 |
| GAD-7 | 7 | Previous two weeks | 0–21 |
| PHQ-9 | 9 | Previous two weeks | 0–27; item 9 is also retained separately |

The flow then adds 16 Kleos-specific tracking items on a stable 0–4 agreement scale. These are explicitly **not validated subscales**, are stored individually, and are not combined into a homemade score.

The Kleos-specific facets cover:

- agency / perceived control;
- demands manageability / subjective overload;
- coping confidence when unexpected problems occur;
- perceived control under competing demands;
- recovery after periods of pressure;
- emotional regulation under pressure;
- task initiation;
- procrastination resistance / follow-through;
- resilience after setbacks;
- rumination control;
- self-respect;
- meaning / psychological coherence;
- intrinsic vs obligatory motivation;
- psychological energy / burnout;
- ability to relax without guilt;
- social connection / loneliness.

The five added stress-oriented facets replace the practical coverage previously sought from PSS-10 without claiming to reproduce, approximate, or validate against PSS-10. They are Kleos-specific longitudinal observations only.

## Wording, attribution, and licensing

The active validated instruments use wording and scoring from sources whose usage terms are compatible with this project:

- **WHO-5:** WHO 2024 open-access republication and exact English wording/scoring. WHO publishes that version under CC BY-NC-SA 3.0 IGO. Source: <https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01>
- **SWLS:** original five-item English scale and 1–7 response format. Ed Diener's official scale page permits non-commercial use with attribution. Source: <https://eddiener.com/satisfaction-with-life-scale-swls/>
- **GAD-7 / PHQ-9:** the Patient Health Questionnaire family states that no permission is required to reproduce, translate, display, or distribute the measures. Kleos preserves the established wording, response scale, and scoring. Sources: <https://www.phqscreeners.com/> and the NIH instrument catalog.

PSS-10 is intentionally not part of the active application. Kleos does not display its wording, collect its responses, calculate its score, or persist PSS-10-specific fields.

## Interpretation constraints

GAD-7 and PHQ-9 are screening measures, not diagnoses. WHO-5's standard suggested low-wellbeing cut-off may be displayed as a screening/attention flag, never as a diagnosis.

PHQ-9 item 9 is treated specially: any value above zero produces an immediate safety notice in the assessment flow, while the numeric response remains part of the stored instrument result. Kleos does not infer diagnosis or risk level mechanically from that item.

The Kleos-specific facets are longitudinal self-tracking evidence. They must not be presented as validated stress, anxiety, depression, burnout, resilience, or other clinical scales.

## Persistence and evidence

`public.goat_psychological_assessments` stores:

- assessment timestamp;
- battery version and per-instrument version metadata;
- numeric item responses sufficient for deterministic rescoring;
- independent WHO-5, SWLS, GAD-7, and PHQ-9 totals;
- PHQ-9 item 9 separately;
- the 16 Kleos-specific facet responses;
- created/updated timestamps for correction history semantics.

The table uses the same owner-only authenticated RLS boundary as other Kleos measurements. New runs insert new rows; corrections edit a selected historical row, and deletion requires explicit confirmation.

The table remains registered in `kleos_evidence_sources`. The registry-driven evidence endpoint therefore exposes it automatically under `evidence_groups` without adding another hard-coded evidence-group list.
