-- DB-owned operator-correction learning.
-- Corrections are durable MemoryDB events, not foundation-model updates.

create table if not exists public.memory_operator_corrections (
  id uuid primary key default gen_random_uuid(),
  correction_key text not null unique,
  query_text text not null,
  failed_behavior text not null,
  corrected_behavior text not null,
  affected_rule_keys text[] not null default '{}',
  request_context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_operator_corrections_query_idx
  on public.memory_operator_corrections using gin (to_tsvector('simple', query_text));

alter table public.zorg_memory
  add column if not exists memory_active boolean not null default true;

create or replace function public.memory_record_operator_correction_v1(
  p_correction_key text,
  p_query_text text,
  p_failed_behavior text,
  p_corrected_behavior text,
  p_affected_rule_keys text[] default '{}',
  p_request_context jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_rule_delta numeric default 1.25
)
returns table(
  correction_id uuid,
  inserted boolean,
  rule_count integer,
  hint_count integer,
  edge_count integer
)
language plpgsql
as $$
declare
  v_key text := nullif(btrim(p_correction_key), '');
  v_query text := btrim(coalesce(p_query_text, ''));
  v_failed text := btrim(coalesce(p_failed_behavior, ''));
  v_corrected text := btrim(coalesce(p_corrected_behavior, ''));
  v_memory_key text;
  v_id uuid;
  v_inserted boolean := false;
  v_rule_count integer := 0;
  v_hint_count integer := 0;
  v_edge_count integer := 0;
  v_rows integer := 0;
  v_rule_key text;
  v_rule_keys text[] := coalesce(p_affected_rule_keys, '{}');
  v_payload jsonb;
begin
  if v_key is null or v_query = '' or v_failed = '' or v_corrected = '' then
    raise exception 'correction key, query, failed behavior, and corrected behavior are required';
  end if;

  insert into public.memory_operator_corrections(
    correction_key, query_text, failed_behavior, corrected_behavior,
    affected_rule_keys, request_context, metadata
  ) values (
    v_key, v_query, v_failed, v_corrected, v_rule_keys,
    coalesce(p_request_context, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (correction_key) do update set updated_at = now()
  returning id, (xmax = 0) into v_id, v_inserted;

  if not v_inserted then
    return query select v_id, false, 0, 0, 0;
    return;
  end if;

  v_memory_key := 'operator-correction:' || v_key;
  v_payload := jsonb_build_object(
    'correction_id', v_id,
    'correction_key', v_key,
    'query_text', v_query,
    'failed_behavior', v_failed,
    'corrected_behavior', v_corrected,
    'affected_rule_keys', to_jsonb(v_rule_keys)
  ) || coalesce(p_request_context, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb);

  insert into public.zorg_memory(
    chat_session_log, memory_key, memory_category, memory_priority, memory_value, memory_active
  ) values (
    'operator_correction:' || v_key,
    v_memory_key,
    'operator_correction',
    'critical',
    concat(
      'Operator correction for query: ', v_query, E'\n',
      'Failed behavior: ', v_failed, E'\n',
      'Corrected behavior: ', v_corrected, E'\n',
      'Affected rules: ', coalesce(array_to_string(v_rule_keys, ', '), '(none)')
    ),
    true
  );

  insert into public.memory_semantic_nodes(
    node_key, node_type, canonical_label, aliases, description, llm_hint,
    source_model, confidence, metadata
  ) values (
    v_memory_key,
    'operator_correction',
    'Operator correction: ' || v_key,
    array[v_key, v_query],
    v_corrected,
    'Prioritize this correction before acting on similar requests.',
    'postgresql:memory_record_operator_correction_v1',
    1.0,
    v_payload
  )
  on conflict (node_key) do update set
    aliases = excluded.aliases,
    description = excluded.description,
    llm_hint = excluded.llm_hint,
    metadata = public.memory_semantic_nodes.metadata || excluded.metadata,
    updated_at = now(), active = true;

  insert into public.memory_recall_hints(
    source_type, source_key, hint_kind, hint_text, related_keys, weight,
    source_model, metadata, active
  ) values (
    'memory', v_memory_key, 'operator_exact_alias', v_query, v_rule_keys,
    25.0, 'postgresql:memory_record_operator_correction_v1', v_payload, true
  )
  on conflict do nothing;
  get diagnostics v_hint_count = row_count;

  insert into public.memory_query_observations(
    query_text, query_intent, source_type, source_key, rank_seen,
    was_useful, usefulness_score, feedback_basis, metadata
  ) values (
    v_query, 'operator_correction_preflight', 'memory', v_memory_key, 1,
    true, 1.0, 'Operator correction recorded for future recall.', v_payload
  );

  insert into public.memory_retrieval_feedback(
    query_text, source_type, source_key, feedback_score, feedback_kind,
    reason, metadata
  ) values (
    v_query, 'memory', v_memory_key, 2.0, 'operator_correction',
    v_corrected, v_payload
  );

  insert into public.memory_semantic_edges(
    subject_type, subject_key, relation, object_type, object_key, weight,
    weight_basis, llm_reason, source_model, evidence_source, evidence_hash, metadata
  ) values (
    'query', md5(lower(v_query)), 'corrected_by', 'operator_correction', v_memory_key,
    5.0, 'operator correction', v_corrected,
    'postgresql:memory_record_operator_correction_v1', v_memory_key,
    md5(v_key), v_payload
  )
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_edge_count := v_edge_count + v_rows;

  foreach v_rule_key in array v_rule_keys loop
    if exists (select 1 from public.zorg_logic_rules where rule_key = v_rule_key) then
      perform public.zorg_record_logic_rule_feedback(
        v_rule_key, v_query, p_rule_delta, 'operator_correction',
        v_corrected, v_payload
      );
      v_rule_count := v_rule_count + 1;

      insert into public.memory_semantic_edges(
        subject_type, subject_key, relation, object_type, object_key, weight,
        weight_basis, llm_reason, source_model, evidence_source, evidence_hash, metadata
      ) values (
        'operator_correction', v_memory_key, 'corrects', 'logic_rule', v_rule_key,
        4.0, 'operator correction', v_corrected,
        'postgresql:memory_record_operator_correction_v1', v_memory_key,
        md5(v_key || ':' || v_rule_key), v_payload
      )
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      v_edge_count := v_edge_count + v_rows;
    end if;
  end loop;

  perform public.memory_enqueue_semantic_job(
    'operator_correction', 'memory', v_memory_key, v_payload, 100
  );

  return query select v_id, true, v_rule_count, v_hint_count, v_edge_count;
end;
$$;

comment on function public.memory_record_operator_correction_v1(text,text,text,text,text[],jsonb,jsonb,numeric)
  is 'Durably applies an operator correction to MemoryDB recall surfaces with idempotency.';
