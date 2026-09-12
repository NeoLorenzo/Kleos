-- Kleos #69: formalize Vector Methodology 2.0 and deterministic vector aggregation.

create table if not exists public.kleos_vector_methodologies (
  version text primary key check (length(btrim(version)) > 0),
  name text not null check (length(btrim(name)) > 0),
  scoring_scope jsonb not null,
  evidence_rules jsonb not null,
  aggregation_rules jsonb not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists kleos_vector_methodologies_one_current_idx
on public.kleos_vector_methodologies ((is_current)) where is_current;

create table if not exists public.kleos_vector_methodology_subdomains (
  methodology_version text not null references public.kleos_vector_methodologies(version) on delete restrict,
  vector_id text not null check (vector_id in ('physical','psychological','intellectual','professional','financial','relational','creative','experiential')),
  vector_order integer not null check (vector_order between 1 and 8),
  vector_label text not null,
  vector_definition text not null,
  subdomain_id text not null,
  subdomain_order integer not null check (subdomain_order between 1 and 20),
  subdomain_label text not null,
  weight numeric(5,2) not null check (weight > 0 and weight <= 100),
  definition text not null,
  anchors jsonb not null,
  primary key (methodology_version, vector_id, subdomain_id)
);

alter table public.kleos_vector_methodologies enable row level security;
alter table public.kleos_vector_methodology_subdomains enable row level security;
revoke all on table public.kleos_vector_methodologies from public, anon, authenticated;
revoke all on table public.kleos_vector_methodology_subdomains from public, anon, authenticated;

update public.kleos_vector_methodologies set is_current = false where is_current;

insert into public.kleos_vector_methodologies (
  version, name, scoring_scope, evidence_rules, aggregation_rules, is_current
) values (
  '2.0.0',
  'Kleos Vector Methodology 2.0',
  jsonb_build_object(
    'normalization','absolute',
    'age_or_career_stage_normalization',false,
    'score_meaning','Scores represent absolute current domain state, not percentile rank for age or life stage.',
    'upper_tail','90+ requires very strong coverage across the domain; 95+ is exceptional and rare; 100 is a practical ceiling rather than a normal target.'
  ),
  jsonb_build_object(
    'absence_of_evidence','Unknown evidence is not negative evidence. Mark the subdomain unknown when the evidence cannot support a defensible score.',
    'coverage','Unknown subdomains do not receive artificial low scores. Instead, assessed-weight coverage limits the maximum whole-vector score and lowers confidence.',
    'recency','Prefer evidence whose time horizon matches the vector/subdomain. Current-state measures generally outweigh stale evidence; stable historical achievements remain relevant where the subdomain is cumulative.',
    'reliability','Prefer structured, objective or externally validated evidence when available. Self-report remains canonical evidence but can justify lower confidence when it is the main support for a consequential claim.',
    'overlap','The same record may support multiple vectors only through a distinct vector-specific property. Do not treat impressive evidence as generic positive evidence across vectors.',
    'conflict','When canonical evidence conflicts, acknowledge the conflict, favor the more direct, recent, reliable source for scoring, and reduce confidence rather than silently selecting the favorable source.'
  ),
  jsonb_build_object(
    'vector_unknown_below_coverage_pct',50,
    'coverage_score_caps',jsonb_build_array(
      jsonb_build_object('min_coverage_pct',50,'max_coverage_pct',64.999,'score_cap',70),
      jsonb_build_object('min_coverage_pct',65,'max_coverage_pct',79.999,'score_cap',82),
      jsonb_build_object('min_coverage_pct',80,'max_coverage_pct',89.999,'score_cap',90),
      jsonb_build_object('min_coverage_pct',90,'max_coverage_pct',99.999,'score_cap',95),
      jsonb_build_object('min_coverage_pct',100,'max_coverage_pct',100,'score_cap',100)
    ),
    'raw_score','Weighted mean across assessed subdomains only; assessed weights are renormalized to 100%.',
    'final_score','Minimum of the raw weighted mean and the coverage score cap, rounded to one decimal place.',
    'confidence_values',jsonb_build_object('low',1,'medium',2,'high',3),
    'vector_confidence','High when coverage >=85% and weighted mean subdomain confidence >=2.5; medium when coverage >=65% and mean >=1.75; otherwise low. Unknown vectors use confidence=unknown.',
    'overall_score','No cross-vector overall score is produced in 2.0.0.'
  ),
  true
)
on conflict (version) do update set
  name=excluded.name,
  scoring_scope=excluded.scoring_scope,
  evidence_rules=excluded.evidence_rules,
  aggregation_rules=excluded.aggregation_rules,
  is_current=true;

delete from public.kleos_vector_methodology_subdomains where methodology_version='2.0.0';

with definitions(vector_id, vector_order, vector_label, vector_definition, subdomain_id, subdomain_order, subdomain_label, weight, definition) as (
  values
  ('physical',1,'Physical','Absolute current physical health and functional capacity. Emphasizes the recent 90-day state; historical evidence matters only where it remains clinically or functionally relevant. Never age-normalize.','clinical_health',1,'Clinical health',20,'Current metabolic, cardiovascular, organ-system and preventive-health state, including clinically meaningful risk factors and disease burden.'),
  ('physical',1,'Physical','Absolute current physical health and functional capacity. Emphasizes the recent 90-day state; historical evidence matters only where it remains clinically or functionally relevant. Never age-normalize.','cardiorespiratory_activity',2,'Cardiorespiratory & activity',20,'Aerobic capacity, habitual movement and cardiovascular functional fitness. Steps alone do not establish elite cardiorespiratory fitness.'),
  ('physical',1,'Physical','Absolute current physical health and functional capacity. Emphasizes the recent 90-day state; historical evidence matters only where it remains clinically or functionally relevant. Never age-normalize.','strength_function',3,'Strength & function',20,'Whole-body strength, mobility and physical function. Machine strength can support this domain; missing movement categories limit coverage rather than counting as weakness.'),
  ('physical',1,'Physical','Absolute current physical health and functional capacity. Emphasizes the recent 90-day state; historical evidence matters only where it remains clinically or functionally relevant. Never age-normalize.','sleep_recovery',4,'Sleep & recovery',20,'Sleep duration, regularity, quality and physiological recovery using recent longitudinal evidence where available.'),
  ('physical',1,'Physical','Absolute current physical health and functional capacity. Emphasizes the recent 90-day state; historical evidence matters only where it remains clinically or functionally relevant. Never age-normalize.','nutrition_body_composition',5,'Nutrition & body composition',20,'Diet quality, adequate protein/fiber/energy/micronutrient coverage, stable/appropriate body mass and body composition where measured.'),
  ('psychological',2,'Psychological','Absolute current psychological wellbeing and self-regulatory functioning, emphasizing recent validated assessments and current functioning rather than personality traits or historical states. Never age-normalize.','wellbeing_symptoms',1,'Wellbeing & symptoms',25,'Current positive wellbeing, life satisfaction and burden of depressive/anxiety symptoms.'),
  ('psychological',2,'Psychological','Absolute current psychological wellbeing and self-regulatory functioning, emphasizing recent validated assessments and current functioning rather than personality traits or historical states. Never age-normalize.','emotional_regulation_resilience',2,'Regulation & resilience',20,'Ability to regulate emotion, recover from stress and cope with unexpected events.'),
  ('psychological',2,'Psychological','Absolute current psychological wellbeing and self-regulatory functioning, emphasizing recent validated assessments and current functioning rather than personality traits or historical states. Never age-normalize.','agency_followthrough',3,'Agency & follow-through',20,'Perceived agency, task initiation, self-efficacy and consistent follow-through.'),
  ('psychological',2,'Psychological','Absolute current psychological wellbeing and self-regulatory functioning, emphasizing recent validated assessments and current functioning rather than personality traits or historical states. Never age-normalize.','stress_load_recovery',4,'Stress load & recovery',20,'Manageability of demands, pressure control, recovery and ability to relax without persistent guilt or rumination.'),
  ('psychological',2,'Psychological','Absolute current psychological wellbeing and self-regulatory functioning, emphasizing recent validated assessments and current functioning rather than personality traits or historical states. Never age-normalize.','meaning_self_regard',5,'Meaning & self-regard',15,'Meaning coherence, self-respect, intrinsic motivation and stable positive self-regard.'),
  ('intellectual',3,'Intellectual','Absolute current intellectual capability and demonstrated mastery: reasoning, knowledge, learning, research rigor and applied problem solving. Scores are not relative to age or educational stage.','reasoning_learning',1,'Reasoning & learning',20,'General reasoning, learning speed, working-memory-related evidence and ability to understand difficult material.'),
  ('intellectual',3,'Intellectual','Absolute current intellectual capability and demonstrated mastery: reasoning, knowledge, learning, research rigor and applied problem solving. Scores are not relative to age or educational stage.','knowledge_academic_mastery',2,'Knowledge & academic mastery',25,'Demonstrated depth and breadth of knowledge through assessed academic or equivalent mastery.'),
  ('intellectual',3,'Intellectual','Absolute current intellectual capability and demonstrated mastery: reasoning, knowledge, learning, research rigor and applied problem solving. Scores are not relative to age or educational stage.','applied_problem_solving',3,'Applied problem solving',20,'Ability to solve novel technical, analytical or conceptual problems in real projects.'),
  ('intellectual',3,'Intellectual','Absolute current intellectual capability and demonstrated mastery: reasoning, knowledge, learning, research rigor and applied problem solving. Scores are not relative to age or educational stage.','research_epistemic_rigor',4,'Research & epistemic rigor',20,'Quality of evidence handling, experimental design, falsification, validation and methodological discipline.'),
  ('intellectual',3,'Intellectual','Absolute current intellectual capability and demonstrated mastery: reasoning, knowledge, learning, research rigor and applied problem solving. Scores are not relative to age or educational stage.','intellectual_output_growth',5,'Intellectual output & growth',15,'Sustained production of serious analysis, research or explanatory work and continued development into deeper expertise.'),
  ('professional',4,'Professional','Absolute current professional capital and demonstrated responsibility, execution, reputation and opportunity set. Do not score relative to age, student status or career stage.','role_responsibility',1,'Role & responsibility',25,'Level, scope and durability of real professional responsibility and ownership.'),
  ('professional',4,'Professional','Absolute current professional capital and demonstrated responsibility, execution, reputation and opportunity set. Do not score relative to age, student status or career stage.','demonstrated_execution',2,'Demonstrated execution',20,'Evidence of delivering useful work, measurable outcomes and reliable execution in professional contexts.'),
  ('professional',4,'Professional','Absolute current professional capital and demonstrated responsibility, execution, reputation and opportunity set. Do not score relative to age, student status or career stage.','career_capital_skills',3,'Career capital & skills',20,'Market-relevant skills, qualifications, portfolio quality and transferable professional capability.'),
  ('professional',4,'Professional','Absolute current professional capital and demonstrated responsibility, execution, reputation and opportunity set. Do not score relative to age, student status or career stage.','external_validation_reputation',4,'External validation & reputation',20,'Credible external signals such as selective roles, publications, awards, references, recognition or market demand.'),
  ('professional',4,'Professional','Absolute current professional capital and demonstrated responsibility, execution, reputation and opportunity set. Do not score relative to age, student status or career stage.','network_optionality',5,'Network & optionality',15,'Depth and usefulness of professional relationships, access to opportunities and realistic future options.'),
  ('financial',5,'Financial','Absolute current financial health, combining asset security with liquidity, independent cash flow, stewardship and risk management. Wealth alone does not determine the vector.','balance_sheet_security',1,'Balance-sheet security',25,'Net assets relative to liabilities and the durability, control and accessibility of those assets.'),
  ('financial',5,'Financial','Absolute current financial health, combining asset security with liquidity, independent cash flow, stewardship and risk management. Wealth alone does not determine the vector.','liquidity_resilience',2,'Liquidity & resilience',20,'Accessible liquidity and ability to absorb shocks without destabilizing the broader financial position.'),
  ('financial',5,'Financial','Absolute current financial health, combining asset security with liquidity, independent cash flow, stewardship and risk management. Wealth alone does not determine the vector.','cash_flow_independence',3,'Cash-flow independence',20,'Sustainable inflows relative to outflows and degree of practical financial autonomy.'),
  ('financial',5,'Financial','Absolute current financial health, combining asset security with liquidity, independent cash flow, stewardship and risk management. Wealth alone does not determine the vector.','capital_allocation_stewardship',4,'Capital allocation & stewardship',20,'Quality of saving, investing, diversification and deployment of capital consistent with goals and risk.'),
  ('financial',5,'Financial','Absolute current financial health, combining asset security with liquidity, independent cash flow, stewardship and risk management. Wealth alone does not determine the vector.','financial_systems_risk',5,'Financial systems & risk',15,'Budgeting/monitoring quality, liability management, tax/insurance/risk awareness and operational control.'),
  ('relational',6,'Relational','Absolute current quality and resilience of the full relationship ecosystem: romantic, friendship, family, community and relationship-maintenance behavior. One strong relationship cannot stand in for the entire vector.','romantic_intimacy',1,'Romantic intimacy',20,'Quality, stability, trust, reciprocity and support in intimate partnership(s), when applicable.'),
  ('relational',6,'Relational','Absolute current quality and resilience of the full relationship ecosystem: romantic, friendship, family, community and relationship-maintenance behavior. One strong relationship cannot stand in for the entire vector.','friendships_peer_support',2,'Friendships & peer support',20,'Depth, reciprocity, reliability and maintenance of close friendships and peer relationships.'),
  ('relational',6,'Relational','Absolute current quality and resilience of the full relationship ecosystem: romantic, friendship, family, community and relationship-maintenance behavior. One strong relationship cannot stand in for the entire vector.','family_support',3,'Family relationships',20,'Quality, support, boundaries and reliability of meaningful family relationships.'),
  ('relational',6,'Relational','Absolute current quality and resilience of the full relationship ecosystem: romantic, friendship, family, community and relationship-maintenance behavior. One strong relationship cannot stand in for the entire vector.','community_belonging',4,'Community & belonging',15,'Belonging, group participation, social embeddedness and access to wider supportive communities.'),
  ('relational',6,'Relational','Absolute current quality and resilience of the full relationship ecosystem: romantic, friendship, family, community and relationship-maintenance behavior. One strong relationship cannot stand in for the entire vector.','relationship_maintenance_quality',5,'Maintenance & relationship skill',25,'Communication, responsiveness, conflict management, deliberate maintenance and ability to sustain relationships over time.'),
  ('creative',7,'Creative','Absolute current creative capability and practice across expressive, conceptual, design or artistic work. Technical work counts only for specifically evidenced originality, craft or creative production; it is not automatically positive because it is difficult or impressive.','original_ideation',1,'Original ideation',20,'Generation of non-trivial original concepts, framings, designs or expressive ideas.'),
  ('creative',7,'Creative','Absolute current creative capability and practice across expressive, conceptual, design or artistic work. Technical work counts only for specifically evidenced originality, craft or creative production; it is not automatically positive because it is difficult or impressive.','craft_capability',2,'Creative craft',20,'Demonstrated command of the medium(s) used to turn ideas into high-quality outputs.'),
  ('creative',7,'Creative','Absolute current creative capability and practice across expressive, conceptual, design or artistic work. Technical work counts only for specifically evidenced originality, craft or creative production; it is not automatically positive because it is difficult or impressive.','output_cadence',3,'Output cadence',25,'Recent sustained production and completion of creative work, not merely historical potential.'),
  ('creative',7,'Creative','Absolute current creative capability and practice across expressive, conceptual, design or artistic work. Technical work counts only for specifically evidenced originality, craft or creative production; it is not automatically positive because it is difficult or impressive.','quality_external_reception',4,'Quality & external reception',20,'Quality signals from audiences, publication, selection, awards, adoption, critique or other credible external response.'),
  ('creative',7,'Creative','Absolute current creative capability and practice across expressive, conceptual, design or artistic work. Technical work counts only for specifically evidenced originality, craft or creative production; it is not automatically positive because it is difficult or impressive.','range_experimentation',5,'Range & experimentation',15,'Willingness and ability to explore different media, forms, styles or creative approaches without confusing breadth with mastery.'),
  ('experiential',8,'Experiential','Current experiential richness built from both accumulated breadth and recent engagement. Lifetime travel contributes to breadth, but high scores also require recent novelty, challenge, depth and integration.','accumulated_breadth',1,'Accumulated breadth',30,'Breadth of genuinely distinct environments, cultures, activities and life contexts experienced over time.'),
  ('experiential',8,'Experiential','Current experiential richness built from both accumulated breadth and recent engagement. Lifetime travel contributes to breadth, but high scores also require recent novelty, challenge, depth and integration.','recent_novelty',2,'Recent novelty & engagement',25,'Frequency and significance of new or meaningfully different experiences in roughly the last 12 months.'),
  ('experiential',8,'Experiential','Current experiential richness built from both accumulated breadth and recent engagement. Lifetime travel contributes to breadth, but high scores also require recent novelty, challenge, depth and integration.','challenge_adventure',3,'Challenge & adventure',20,'Experiences involving meaningful challenge, uncertainty, physical/mental stretch or deliberate departure from routine.'),
  ('experiential',8,'Experiential','Current experiential richness built from both accumulated breadth and recent engagement. Lifetime travel contributes to breadth, but high scores also require recent novelty, challenge, depth and integration.','immersion_depth',4,'Immersion & depth',15,'Depth of engagement with places, activities or communities rather than superficial exposure.'),
  ('experiential',8,'Experiential','Current experiential richness built from both accumulated breadth and recent engagement. Lifetime travel contributes to breadth, but high scores also require recent novelty, challenge, depth and integration.','reflection_integration',5,'Reflection & integration',10,'Evidence that experiences are reflected on, learned from and integrated into identity, judgment or future behavior.')
)
insert into public.kleos_vector_methodology_subdomains (
  methodology_version,vector_id,vector_order,vector_label,vector_definition,
  subdomain_id,subdomain_order,subdomain_label,weight,definition,anchors
)
select '2.0.0',vector_id,vector_order,vector_label,vector_definition,
  subdomain_id,subdomain_order,subdomain_label,weight,definition,
  jsonb_build_object(
    '0','No functional evidence of '||lower(subdomain_label)||', or clear severe impairment/failure in this area.',
    '25','Very weak '||lower(subdomain_label)||': substantial deficits, instability or only minimal positive evidence.',
    '50','Basic/adequate '||lower(subdomain_label)||': functional but ordinary, inconsistent, narrow or materially constrained.',
    '70','Strong '||lower(subdomain_label)||': clearly above a merely adequate state, with solid evidence and manageable limitations.',
    '85','Very strong '||lower(subdomain_label)||': sustained, broad and well-supported performance with only limited material weaknesses.',
    '95','Exceptional '||lower(subdomain_label)||': rare, highly complete and strongly evidenced performance; important weaknesses are absent or minor.',
    '100','Practical ceiling for '||lower(subdomain_label)||': extraordinarily complete, durable and independently supported; reserved for a state with essentially no meaningful unmet dimension.'
  )
from definitions;

do $$
declare v_bad text;
begin
  select string_agg(vector_id,', ') into v_bad from (
    select vector_id from public.kleos_vector_methodology_subdomains
    where methodology_version='2.0.0'
    group by vector_id having sum(weight)<>100
  ) x;
  if v_bad is not null then raise exception 'KLEOS_METHODOLOGY_WEIGHT_INVALID:%',v_bad; end if;
end;
$$;

alter table public.kleos_vector_snapshot_results
  add column if not exists coverage_pct numeric(5,2) null check (coverage_pct is null or (coverage_pct>=0 and coverage_pct<=100)),
  add column if not exists raw_score numeric(5,2) null check (raw_score is null or (raw_score>=0 and raw_score<=100)),
  add column if not exists aggregation_details jsonb null;

create table if not exists public.kleos_vector_snapshot_subdomain_results (
  snapshot_id uuid not null references public.kleos_vector_snapshots(id) on delete cascade,
  vector_id text not null,
  subdomain_id text not null,
  methodology_version text not null,
  weight numeric(5,2) not null check (weight>0 and weight<=100),
  status text not null check (status in ('assessed','unknown')),
  score numeric(5,2) null check (score is null or (score>=0 and score<=100)),
  confidence text not null check (confidence in ('low','medium','high','unknown')),
  commentary text not null check (length(btrim(commentary))>0),
  primary key (snapshot_id,vector_id,subdomain_id),
  check ((status='assessed' and score is not null and confidence in ('low','medium','high')) or (status='unknown' and score is null and confidence='unknown'))
);

create index if not exists kleos_vector_snapshot_subdomains_snapshot_idx
on public.kleos_vector_snapshot_subdomain_results (snapshot_id,vector_id);

alter table public.kleos_vector_snapshot_subdomain_results enable row level security;
grant select on table public.kleos_vector_snapshot_subdomain_results to authenticated;
revoke insert,update,delete on table public.kleos_vector_snapshot_subdomain_results from authenticated;
revoke all on table public.kleos_vector_snapshot_subdomain_results from anon;

drop policy if exists "Authorized user can read Kleos vector subdomain snapshot results" on public.kleos_vector_snapshot_subdomain_results;
create policy "Authorized user can read Kleos vector subdomain snapshot results"
on public.kleos_vector_snapshot_subdomain_results for select to authenticated
using (exists (
  select 1 from public.kleos_vector_snapshots s
  where s.id=snapshot_id and s.user_id=(select auth.uid())
    and lower(coalesce((select auth.jwt())->>'email',''))='theneolorenzo@gmail.com'
));

create or replace function public.get_kleos_evaluation_methodology()
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp
as $$
declare v_method public.kleos_vector_methodologies%rowtype; v_vectors jsonb;
begin
  if session_user<>'postgres' then raise exception 'KLEOS_TOOL_NOT_AUTHORIZED'; end if;
  select * into v_method from public.kleos_vector_methodologies where is_current limit 1;
  if v_method.version is null then raise exception 'KLEOS_METHODOLOGY_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.vector_id,'label',v.vector_label,'definition',v.vector_definition,'subdomains',v.subdomains
  ) order by v.vector_order),'[]'::jsonb)
  into v_vectors
  from (
    select vector_id,min(vector_order) vector_order,min(vector_label) vector_label,min(vector_definition) vector_definition,
      jsonb_agg(jsonb_build_object('id',subdomain_id,'label',subdomain_label,'weight',weight,'definition',definition,'anchors',anchors) order by subdomain_order) subdomains
    from public.kleos_vector_methodology_subdomains
    where methodology_version=v_method.version
    group by vector_id
  ) v;
  return jsonb_build_object('version',v_method.version,'name',v_method.name,'scoring_scope',v_method.scoring_scope,'evidence_rules',v_method.evidence_rules,'aggregation',v_method.aggregation_rules,'vectors',v_vectors);
end;
$$;
revoke all on function public.get_kleos_evaluation_methodology() from public,anon,authenticated,service_role;

create or replace function public.get_kleos_evaluation_context()
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp
as $$
begin
  if session_user<>'postgres' then raise exception 'KLEOS_TOOL_NOT_AUTHORIZED'; end if;
  return jsonb_build_object('methodology',public.get_kleos_evaluation_methodology(),'evidence',public.get_kleos_bot_evaluation_evidence_admin());
end;
$$;
revoke all on function public.get_kleos_evaluation_context() from public,anon,authenticated,service_role;

drop function if exists public.persist_kleos_evaluation(text,jsonb,numeric);

create function public.persist_kleos_evaluation(p_execution_key text,p_vectors jsonb)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_owner_id uuid; v_methodology_version text; v_execution_key text; v_existing_id uuid; v_snapshot_id uuid;
  v_vector_count integer; v_distinct_vector_count integer; v_expected_subdomains integer; v_input_subdomains integer; v_distinct_subdomains integer; v_results jsonb;
begin
  if session_user<>'postgres' then raise exception 'KLEOS_TOOL_NOT_AUTHORIZED'; end if;
  select id into v_owner_id from auth.users where lower(email)='theneolorenzo@gmail.com' order by created_at asc limit 1;
  if v_owner_id is null then raise exception 'KLEOS_BOT_OWNER_NOT_FOUND'; end if;
  select version into v_methodology_version from public.kleos_vector_methodologies where is_current limit 1;
  if v_methodology_version is null then raise exception 'KLEOS_METHODOLOGY_NOT_FOUND'; end if;
  v_execution_key:=btrim(coalesce(p_execution_key,''));
  if length(v_execution_key)=0 then raise exception 'KLEOS_BOT_EXECUTION_KEY_REQUIRED'; end if;
  if length(v_execution_key)>120 then raise exception 'KLEOS_BOT_EXECUTION_KEY_TOO_LONG'; end if;
  if jsonb_typeof(p_vectors)<>'array' then raise exception 'KLEOS_V2_VECTORS_MUST_BE_ARRAY'; end if;
  select count(*),count(distinct v->>'vector_id') into v_vector_count,v_distinct_vector_count from jsonb_array_elements(p_vectors) v;
  if v_vector_count<>8 or v_distinct_vector_count<>8 then raise exception 'KLEOS_V2_REQUIRES_EIGHT_DISTINCT_VECTORS'; end if;
  if exists (select 1 from jsonb_array_elements(p_vectors) v where not exists (
    select 1 from public.kleos_vector_methodology_subdomains m where m.methodology_version=v_methodology_version and m.vector_id=v->>'vector_id'
  )) then raise exception 'KLEOS_V2_VECTOR_INVALID'; end if;
  if exists (select 1 from jsonb_array_elements(p_vectors) v where length(btrim(coalesce(v->>'commentary','')))=0 or jsonb_typeof(v->'subdomains')<>'array')
    then raise exception 'KLEOS_V2_VECTOR_PAYLOAD_INVALID'; end if;
  select count(*) into v_expected_subdomains from public.kleos_vector_methodology_subdomains where methodology_version=v_methodology_version;
  with input_subdomains as (
    select v->>'vector_id' vector_id,s->>'subdomain_id' subdomain_id,s
    from jsonb_array_elements(p_vectors) v cross join lateral jsonb_array_elements(v->'subdomains') s
  ) select count(*),count(distinct vector_id||':'||subdomain_id) into v_input_subdomains,v_distinct_subdomains from input_subdomains;
  if v_input_subdomains<>v_expected_subdomains or v_distinct_subdomains<>v_expected_subdomains then raise exception 'KLEOS_V2_SUBDOMAIN_COVERAGE_INVALID'; end if;
  if exists (
    with input_subdomains as (
      select v->>'vector_id' vector_id,s->>'subdomain_id' subdomain_id
      from jsonb_array_elements(p_vectors) v cross join lateral jsonb_array_elements(v->'subdomains') s
    ) select 1 from input_subdomains i left join public.kleos_vector_methodology_subdomains m
      on m.methodology_version=v_methodology_version and m.vector_id=i.vector_id and m.subdomain_id=i.subdomain_id
      where m.subdomain_id is null
  ) then raise exception 'KLEOS_V2_SUBDOMAIN_INVALID'; end if;
  if exists (
    with input_subdomains as (
      select v->>'vector_id' vector_id,s
      from jsonb_array_elements(p_vectors) v cross join lateral jsonb_array_elements(v->'subdomains') s
    ) select 1 from input_subdomains
    where length(btrim(coalesce(s->>'commentary','')))=0
       or coalesce(s->>'status','') not in ('assessed','unknown')
       or case
         when s->>'status'='assessed' then jsonb_typeof(s->'score')<>'number' or (s->>'score')::numeric<0 or (s->>'score')::numeric>100 or coalesce(s->>'confidence','') not in ('low','medium','high')
         when s->>'status'='unknown' then (s?'score' and s->'score'<>'null'::jsonb) or coalesce(s->>'confidence','')<>'unknown'
         else true end
  ) then raise exception 'KLEOS_V2_SUBDOMAIN_RESULT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner_id::text||':kleos-bot:'||v_execution_key,0));
  select id into v_existing_id from public.kleos_vector_snapshots
  where user_id=v_owner_id and evaluator='kleos-bot' and execution_key=v_execution_key order by created_at desc limit 1;
  if v_existing_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('vector_id',r.vector_id,'status',r.status,'score',r.score,'confidence',r.confidence,'coverage_pct',r.coverage_pct) order by r.vector_id),'[]'::jsonb)
      into v_results from public.kleos_vector_snapshot_results r where r.snapshot_id=v_existing_id;
    return jsonb_build_object('snapshot_id',v_existing_id,'created',false,'methodology_version',(select methodology_version from public.kleos_vector_snapshots where id=v_existing_id),'results',v_results);
  end if;
  insert into public.kleos_vector_snapshots(user_id,evaluated_at,evaluator,methodology_version,overall_score,execution_key)
    values(v_owner_id,now(),'kleos-bot',v_methodology_version,null,v_execution_key) returning id into v_snapshot_id;
  insert into public.kleos_vector_snapshot_subdomain_results(snapshot_id,vector_id,subdomain_id,methodology_version,weight,status,score,confidence,commentary)
  select v_snapshot_id,m.vector_id,m.subdomain_id,v_methodology_version,m.weight,i.s->>'status',
    case when i.s->>'status'='assessed' then (i.s->>'score')::numeric else null end,i.s->>'confidence',btrim(i.s->>'commentary')
  from public.kleos_vector_methodology_subdomains m
  join lateral (
    select s from jsonb_array_elements(p_vectors) v cross join lateral jsonb_array_elements(v->'subdomains') s
    where v->>'vector_id'=m.vector_id and s->>'subdomain_id'=m.subdomain_id limit 1
  ) i on true where m.methodology_version=v_methodology_version;
  with agg as (
    select vector_id,coalesce(sum(weight) filter(where status='assessed'),0)::numeric coverage,
      sum(weight*score) filter(where status='assessed') weighted_score,
      sum(weight*case confidence when 'low' then 1 when 'medium' then 2 when 'high' then 3 else 0 end) filter(where status='assessed') weighted_confidence
    from public.kleos_vector_snapshot_subdomain_results where snapshot_id=v_snapshot_id group by vector_id
  ), prepared as (
    select a.*,case when coverage>0 then weighted_score/coverage else null end raw_score,
      case when coverage>0 then weighted_confidence/coverage else null end confidence_mean,
      case when coverage<50 then null when coverage<65 then 70 when coverage<80 then 82 when coverage<90 then 90 when coverage<100 then 95 else 100 end::numeric score_cap
    from agg a
  ), input_vectors as (
    select v->>'vector_id' vector_id,btrim(v->>'commentary') commentary from jsonb_array_elements(p_vectors) v
  )
  insert into public.kleos_vector_snapshot_results(snapshot_id,vector_id,status,score,confidence,commentary,coverage_pct,raw_score,aggregation_details)
  select v_snapshot_id,p.vector_id,case when p.coverage<50 then 'unknown' else 'assessed' end,
    case when p.coverage<50 then null else least(round(p.raw_score,1),p.score_cap) end,
    case when p.coverage<50 then 'unknown' when p.coverage>=85 and p.confidence_mean>=2.5 then 'high' when p.coverage>=65 and p.confidence_mean>=1.75 then 'medium' else 'low' end,
    iv.commentary,p.coverage,case when p.raw_score is null then null else round(p.raw_score,1) end,
    jsonb_build_object('coverage_pct',p.coverage,'score_cap',p.score_cap,'confidence_mean',case when p.confidence_mean is null then null else round(p.confidence_mean,2) end,'aggregation','weighted_assessed_subdomains_with_coverage_cap')
  from prepared p join input_vectors iv using(vector_id);
  select coalesce(jsonb_agg(jsonb_build_object('vector_id',r.vector_id,'status',r.status,'score',r.score,'confidence',r.confidence,'coverage_pct',r.coverage_pct) order by r.vector_id),'[]'::jsonb)
    into v_results from public.kleos_vector_snapshot_results r where r.snapshot_id=v_snapshot_id;
  return jsonb_build_object('snapshot_id',v_snapshot_id,'created',true,'methodology_version',v_methodology_version,'results',v_results);
end;
$$;

revoke all on function public.persist_kleos_evaluation(text,jsonb) from public,anon,authenticated,service_role;
