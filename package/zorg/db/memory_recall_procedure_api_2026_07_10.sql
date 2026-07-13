-- DB-owned recall API: keep Python callers thin and put recall/ranking SQL
-- behind stable PostgreSQL procedures.

create or replace function public.memory_recall_source_type(p_source_table text)
returns text
language sql
immutable
as $$
  select case coalesce(p_source_table, '')
    when 'directive' then 'directive'
    when 'runbook' then 'runbook'
    when 'project' then 'project'
    when 'project_fact' then 'project_fact'
    when 'host' then 'host'
    when 'service' then 'service'
    when 'relationship' then 'relationship'
    when 'recall_hint' then 'recall_hint'
    when 'query_observation' then 'query_observation'
    when 'operational_fact' then 'operational_fact'
    when 'contact' then 'contact'
    when 'logic_rule' then 'logic_rule'
    else 'memory'
  end
$$;

create or replace function public.memory_recall_tokens_v1(p_query text, p_limit integer default 12)
returns table(token text)
language sql
stable
as $$
  select distinct t.token
  from regexp_split_to_table(lower(coalesce(p_query, '')), '[^a-z0-9]+') as t(token)
  where length(t.token) >= 4
    and t.token not in (
      'what','when','where','which','while','with','from','that','this','your','youre',
      'have','been','being','were','does','into','about','supposed','remember','using',
      'should','would','could','there','their','they','them','then','than','time'
    )
  limit greatest(coalesce(p_limit, 12), 1)
$$;

create or replace function public.memory_recall_exact_alias_v1(p_query text, p_limit integer default 10)
returns table(
  source_type text,
  source_id text,
  path text,
  line_start integer,
  line_end integer,
  priority text,
  content text,
  score numeric,
  score_reason text,
  metadata jsonb
)
language sql
stable
as $$
  with exact_hints as (
    select h.id, h.source_type, h.source_key, h.hint_kind, h.hint_text, h.weight
    from public.memory_recall_hints h
    where coalesce(h.active, true)
      and h.hint_kind in ('exact_query_alias', 'operator_exact_alias')
      and lower(regexp_replace(h.hint_text, '\s+', ' ', 'g')) = lower(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'))
    order by h.weight desc, h.updated_at desc
    limit greatest(coalesce(p_limit, 10) * 2, 10)
  ), linked_rules as (
    select
      'logic_rule'::text as source_type,
      r.id::text as source_id,
      null::text as path,
      null::integer as line_start,
      null::integer as line_end,
      coalesce(r.priority::text, 'critical') as priority,
      left(concat_ws(E'\n',
        'Logic rule: ' || coalesce(r.title, r.rule_key),
        'Key: ' || r.rule_key,
        'Rule: ' || r.rule_text
      ), 4000) as content,
      (1000 + coalesce(h.weight, 0))::numeric as score,
      'exact recall hint linked logic rule'::text as score_reason,
      jsonb_build_object('hint_id', h.id, 'hint_kind', h.hint_kind, 'source_key', h.source_key) as metadata
    from exact_hints h
    join public.zorg_logic_rules r
      on h.source_type = 'logic_rule'
     and r.rule_key = h.source_key
     and coalesce(r.active, true)
  ), linked_memories as (
    select
      'memory'::text as source_type,
      z.id::text as source_id,
      null::text as path,
      null::integer as line_start,
      null::integer as line_end,
      coalesce(z.memory_priority, 'critical') as priority,
      left(coalesce(z.memory_value, z.chat_session_log, ''), 4000) as content,
      (950 + coalesce(h.weight, 0))::numeric as score,
      'exact recall hint linked memory row'::text as score_reason,
      jsonb_build_object('hint_id', h.id, 'hint_kind', h.hint_kind, 'source_key', h.source_key) as metadata
    from exact_hints h
    join public.zorg_memory z
      on h.source_type in ('memory', 'zorg_memory', 'recall_hint')
     and z.memory_key = h.source_key
     and coalesce(z.memory_active, true)
  ), hint_rows as (
    select
      'recall_hint'::text as source_type,
      h.id::text as source_id,
      null::text as path,
      null::integer as line_start,
      null::integer as line_end,
      'critical'::text as priority,
      left(concat_ws(E'\n', h.source_key, h.hint_kind, h.hint_text), 4000) as content,
      (900 + coalesce(h.weight, 0))::numeric as score,
      'exact recall hint row'::text as score_reason,
      jsonb_build_object('hint_id', h.id, 'hint_kind', h.hint_kind, 'source_key', h.source_key) as metadata
    from exact_hints h
  )
  select * from linked_rules
  union all
  select * from linked_memories
  union all
  select * from hint_rows
  order by score desc
  limit greatest(coalesce(p_limit, 10), 1)
$$;

create or replace function public.memory_recall_fast_mv_v1(p_query text, p_limit integer default 10)
returns table(
  source_type text,
  source_id text,
  path text,
  line_start integer,
  line_end integer,
  priority text,
  content text,
  score numeric,
  score_reason text,
  metadata jsonb
)
language sql
stable
as $$
  with tokens as (
    select token from public.memory_recall_tokens_v1(p_query, 12)
  ), candidates as (
    select
      z.source_table,
      z.source_id,
      z.priority,
      left(z.content, 4000) as content,
      z.source_rank,
      z.priority_rank,
      z.event_ts,
      z.content_len,
      (
        select count(*)::integer
        from tokens t
        where z.content_lc like '%' || t.token || '%'
      ) as token_hits,
      case when z.content_fts_simple @@ plainto_tsquery('simple', coalesce(p_query, '')) then 1 else 0 end as fts_hit,
      case when z.content_lc like '%' || lower(left(coalesce(p_query, ''), 160)) || '%' then 2 else 0 end as phrase_hit
    from public.zorg_memory_search_fast_mv z
    where not (
      z.source_table = 'zorg_memory'
      and z.category like 'chat_ingest%'
      and z.content_lc like '%source%'
      and (
        z.content_lc like '%preserve source memory%'
        or z.content_lc like '%preserve source data%'
        or z.content_lc like '%source memory must never be deleted%'
        or z.content_lc like '%source memory must never be%pruned%'
        or z.content_lc like '%do not delete source memory%'
        or z.content_lc like '%do not delete source rows%'
        or z.content_lc like '%source rows%'
        or z.content_lc like '%additive only%'
        or z.content_lc like '%improve recall additively%'
        or z.content_lc like '%preserve%'
        or z.content_lc like '%prune%'
        or z.content_lc like '%delete%'
      )
    )
    and (
      z.content_fts_simple @@ plainto_tsquery('simple', coalesce(p_query, ''))
      or exists (select 1 from tokens t where z.content_lc like '%' || t.token || '%')
      or z.content_lc like '%' || lower(left(coalesce(p_query, ''), 160)) || '%'
    )
    order by (select count(*) from tokens t where z.content_lc like '%' || t.token || '%') desc,
             z.priority_rank, z.source_rank, z.event_ts desc nulls last
    limit greatest(coalesce(p_limit, 10) * 20, 200)
  ), scored as (
    select
      public.memory_recall_source_type(source_table) as source_type,
      source_id,
      null::text as path,
      null::integer as line_start,
      null::integer as line_end,
      coalesce(priority, 'medium') as priority,
      content,
      (
        ((token_hits + fts_hit + phrase_hit)::numeric
          * greatest(1, 10 - priority_rank * 2)
          * greatest(1, 10 - source_rank))
        / greatest(content_len, 100)
      ) as score,
      concat_ws(',', 'fast_mv', 'tokens=' || token_hits, 'fts=' || fts_hit, 'phrase=' || phrase_hit) as score_reason,
      jsonb_build_object(
        'source_table', source_table,
        'source_rank', source_rank,
        'priority_rank', priority_rank,
        'token_hits', token_hits,
        'fts_hit', fts_hit,
        'phrase_hit', phrase_hit
      ) as metadata
    from candidates
  )
  select *
  from scored
  order by score desc, priority, source_id
  limit greatest(coalesce(p_limit, 10), 1)
$$;

create or replace function public.memory_recall_v2(
  p_query text,
  p_limit integer default 10,
  p_context jsonb default '{}'::jsonb
)
returns table(
  source_type text,
  source_id text,
  path text,
  line_start integer,
  line_end integer,
  priority text,
  content text,
  recall_mode text,
  rank integer,
  score numeric,
  score_reason text,
  metadata jsonb
)
language plpgsql
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 10), 1);
  v_query text := coalesce(p_query, '');
  v_ann_limit integer := least(greatest(v_limit, 5), 8);
  v_has_ann boolean := false;
begin
  perform public.memory_enqueue_semantic_job(
    'recall_query',
    'query',
    md5(lower(v_query)),
    jsonb_build_object('query_text', v_query, 'context', coalesce(p_context, '{}'::jsonb)),
    40
  );

  select exists (
    select 1
    from public.memory_query_embedding_cache
    where active
      and query_hash = md5(lower(btrim(v_query)))
      and embedding_provider = coalesce(p_context->>'embedding_provider', 'local')
      and embedding_model = coalesce(p_context->>'embedding_model', 'nomic-embed-text:latest')
  ) into v_has_ann;

  return query
  with exact_rows as (
    select *, 1000::numeric as layer_boost, 'exact_alias'::text as layer
    from public.memory_recall_exact_alias_v1(v_query, v_limit)
  ), rule_rows as (
    select
      r.source_type, r.source_id, r.path, r.line_start, r.line_end,
      coalesce(r.priority, 'critical') as priority,
      left(r.content, 4000) as content,
      850::numeric as score,
      'logic rule preflight procedure'::text as score_reason,
      jsonb_build_object('procedure', 'zorg_get_logic_context') as metadata,
      850::numeric as layer_boost,
      'logic_preflight'::text as layer
    from public.zorg_get_logic_context(v_query, greatest(6, least(v_limit, 16))) r
  ), weighted_rows as (
    select
      w.source_type, w.source_id, w.path, w.line_start, w.line_end,
      coalesce(w.priority, 'medium') as priority,
      left(w.content, 4000) as content,
      coalesce(w.relevance_score, 0)::numeric as score,
      coalesce(w.score_reason, 'weighted recall procedure') as score_reason,
      coalesce(w.weight_breakdown, '{}'::jsonb) || jsonb_build_object('procedure', 'zorg_weighted_recall_context') as metadata,
      500::numeric as layer_boost,
      'weighted'::text as layer
    from public.zorg_weighted_recall_context(v_query, greatest(v_limit, 12)) w
  ), fast_rows as (
    select *, 350::numeric as layer_boost, 'fast_mv'::text as layer
    from public.memory_recall_fast_mv_v1(v_query, greatest(v_limit, 12))
  ), ann_rows as (
    select
      a.source_type, a.source_id, a.path, a.line_start, a.line_end,
      coalesce(a.priority, 'medium') as priority,
      left(a.content, 4000) as content,
      coalesce(a.vector_score, 0)::numeric as score,
      'pgvector ANN provider recall'::text as score_reason,
      jsonb_build_object(
        'procedure', 'memory_provider_ann_recall',
        'vector_distance', a.vector_distance,
        'embedding_provider', coalesce(p_context->>'embedding_provider', 'local'),
        'embedding_model', coalesce(p_context->>'embedding_model', 'nomic-embed-text:latest')
      ) as metadata,
      300::numeric as layer_boost,
      'pgvector_ann'::text as layer
    from public.memory_provider_ann_recall(
      v_query,
      v_ann_limit,
      coalesce(p_context->>'embedding_provider', 'local'),
      coalesce(p_context->>'embedding_model', 'nomic-embed-text:latest')
    ) a
    where v_has_ann
  ), combined as (
    select * from exact_rows
    union all select * from rule_rows
    union all select * from weighted_rows
    union all select * from fast_rows
    union all select * from ann_rows
  ), deduped as (
    select
      c.*,
      row_number() over (
        partition by c.source_type, c.source_id
        order by c.layer_boost desc, c.score desc, length(c.content) desc
      ) as dupe_rank
    from combined c
    where nullif(c.content, '') is not null
  ), ranked as (
    select
      d.*,
      row_number() over (
        order by d.layer_boost desc, d.score desc,
          case lower(coalesce(d.priority, 'medium'))
            when 'critical' then 1
            when 'high' then 2
            when 'medium' then 3
            else 4
          end,
          d.source_type,
          d.source_id
      )::integer as out_rank
    from deduped d
    where d.dupe_rank = 1
  )
  select
    r.source_type,
    r.source_id,
    r.path,
    r.line_start,
    r.line_end,
    r.priority,
    r.content,
    case
      when exists (select 1 from ranked x where x.layer = 'pgvector_ann') then 'database-stored-procedure-hybrid-pgvector-ann'
      else 'database-stored-procedure-hybrid'
    end as recall_mode,
    r.out_rank as rank,
    (r.layer_boost + r.score) as score,
    concat_ws(':', r.layer, r.score_reason) as score_reason,
    r.metadata || jsonb_build_object('layer', r.layer, 'procedure_api', 'memory_recall_v2') as metadata
  from ranked r
  order by r.out_rank
  limit v_limit;
end;
$$;

create or replace function public.memory_search_table_v1(p_table text, p_query text, p_limit integer default 10)
returns table(row_data jsonb)
language plpgsql
as $$
declare
  v_table text := lower(coalesce(p_table, 'all'));
  v_limit integer := greatest(coalesce(p_limit, 10), 1);
begin
  if v_table = 'all' then
    return query
    select to_jsonb(r) - 'recall_mode' - 'rank' - 'score' - 'score_reason' - 'metadata'
    from public.memory_recall_v2(p_query, v_limit, '{}'::jsonb) r
    order by r.rank;
    return;
  end if;

  if v_table = 'ann' then
    return query
    select to_jsonb(r)
    from public.memory_ann_recall(p_query, v_limit) r;
    return;
  end if;

  if v_table = 'project' then
    return query select to_jsonb(r) from public.zorg_get_project_context(p_query, v_limit) r;
    return;
  end if;

  if v_table = 'host' then
    return query select to_jsonb(r) from public.zorg_get_host_context(p_query, v_limit) r;
    return;
  end if;

  if v_table = 'runbook' then
    return query select to_jsonb(r) from public.zorg_get_runbook_context(p_query, v_limit) r;
    return;
  end if;

  if v_table = 'zorg_memory' then
    return query
    with matches as (
      select id, logged_at, memory_category, memory_priority,
             left(coalesce(memory_value, chat_session_log, ''), 240) as snippet
      from public.zorg_memory
      where coalesce(memory_value, '') ilike '%' || coalesce(p_query, '') || '%'
         or coalesce(chat_session_log, '') ilike '%' || coalesce(p_query, '') || '%'
         or coalesce(memory_key, '') ilike '%' || coalesce(p_query, '') || '%'
         or coalesce(system_prompt, '') ilike '%' || coalesce(p_query, '') || '%'
         or coalesce(ai_response, '') ilike '%' || coalesce(p_query, '') || '%'
      order by logged_at desc
      limit v_limit
    )
    select to_jsonb(matches) from matches;
    return;
  end if;

  raise exception 'Unsupported MemoryDB search table: %', p_table;
end;
$$;

create or replace function public.memory_get_row_v1(p_table text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_table text := lower(coalesce(p_table, ''));
  v_row jsonb;
begin
  if v_table = 'zorg_memory' then
    if p_key ~ '^[0-9a-f-]{32,36}$' then
      select to_jsonb(z) into v_row
      from public.zorg_memory z
      where z.id::text = p_key
      limit 1;
    else
      select to_jsonb(z) into v_row
      from public.zorg_memory z
      order by z.logged_at asc
      offset greatest(p_key::integer - 1, 0)
      limit 1;
    end if;
    return v_row;
  end if;

  if v_table in ('md_agents','md_heartbeat','md_identity','md_soul','md_tools','md_user') then
    execute format(
      'select to_jsonb(t) from public.%I t where %s limit 1',
      v_table,
      case when p_key ~ '^[0-9a-f-]{32,36}$' then 't.id::text = $1' else 't.line_no = $1::integer' end
    )
    using p_key
    into v_row;
    return v_row;
  end if;

  raise exception 'Unsupported MemoryDB get table: %', p_table;
end;
$$;

create or replace function public.memory_recent_v1(p_limit integer default 20)
returns table(row_data jsonb)
language sql
stable
as $$
  select to_jsonb(r)
  from (
    select id, logged_at, memory_category, memory_priority,
           left(coalesce(memory_value, chat_session_log, ''), 240) as snippet
    from public.zorg_memory
    order by logged_at desc
    limit greatest(coalesce(p_limit, 20), 1)
  ) r
$$;

create or replace function public.memory_master_context_v1(p_limit integer default 40)
returns table(row_data jsonb)
language sql
stable
as $$
  select to_jsonb(r)
  from (
    select source_type, source_id, priority, sort_ts, title,
           left(content, 280) as content
    from public.zorg_master_context_mv
    order by
      case when lower(priority)='critical' then 1
           when lower(priority)='high' then 2
           when lower(priority)='medium' then 3
           else 4 end,
      sort_ts desc
    limit greatest(coalesce(p_limit, 40), 1)
  ) r
$$;

create or replace function public.memory_tables_v1()
returns table(table_name text)
language sql
stable
as $$
  values
    ('md_agents'::text),
    ('md_heartbeat'::text),
    ('md_identity'::text),
    ('md_soul'::text),
    ('md_tools'::text),
    ('md_user'::text),
    ('zorg_memory'::text),
    ('all'::text),
    ('ann'::text),
    ('project'::text),
    ('host'::text),
    ('runbook'::text)
$$;
