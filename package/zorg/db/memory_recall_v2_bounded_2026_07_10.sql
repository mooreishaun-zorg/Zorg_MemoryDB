-- Bound the hot recall procedure so normal calls stay fast. Deep weighted
-- recall remains available through p_context {"mode":"deep"}.

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
  v_deep boolean := lower(coalesce(p_context->>'mode', 'normal')) in ('deep', 'weighted', 'full');
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
  ), fast_rows as (
    select *, 500::numeric as layer_boost, 'fast_mv'::text as layer
    from public.memory_recall_fast_mv_v1(v_query, greatest(v_limit, 12))
  ), weighted_rows as (
    select
      w.source_type, w.source_id, w.path, w.line_start, w.line_end,
      coalesce(w.priority, 'medium') as priority,
      left(w.content, 4000) as content,
      coalesce(w.relevance_score, 0)::numeric as score,
      coalesce(w.score_reason, 'weighted recall procedure') as score_reason,
      coalesce(w.weight_breakdown, '{}'::jsonb) || jsonb_build_object('procedure', 'zorg_weighted_recall_context') as metadata,
      450::numeric as layer_boost,
      'weighted_deep'::text as layer
    from public.zorg_weighted_recall_context(v_query, v_limit) w
    where v_deep
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
      425::numeric as layer_boost,
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
    union all select * from fast_rows
    union all select * from weighted_rows
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
    concat_ws('-',
      'database-stored-procedure-hybrid',
      case when exists (select 1 from ranked x where x.layer = 'pgvector_ann') then 'pgvector-ann' end,
      case when v_deep then 'deep-weighted' end
    ) as recall_mode,
    r.out_rank as rank,
    (r.layer_boost + r.score) as score,
    concat_ws(':', r.layer, r.score_reason) as score_reason,
    r.metadata || jsonb_build_object('layer', r.layer, 'procedure_api', 'memory_recall_v2') as metadata
  from ranked r
  order by r.out_rank
  limit v_limit;
end;
$$;

create or replace function public.memory_query_embedding_cache_exists_v1(
  p_query text,
  p_provider text default 'local',
  p_model text default 'nomic-embed-text:latest'
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memory_query_embedding_cache
    where active
      and query_hash = md5(lower(btrim(coalesce(p_query, ''))))
      and embedding_provider = coalesce(p_provider, 'local')
      and embedding_model = coalesce(p_model, 'nomic-embed-text:latest')
  )
$$;

create or replace function public.memory_search_count_v1(p_query text)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.zorg_memory_search_fast_mv
  where content_lc like '%' || lower(coalesce(p_query, '')) || '%'
     or content_fts_simple @@ plainto_tsquery('simple', coalesce(p_query, ''))
$$;

create or replace function public.memory_search_analyze_v1()
returns void
language plpgsql
as $$
begin
  analyze public.zorg_memory_search_fast_mv;
end;
$$;

create or replace function public.memory_semantic_source_text_v1(
  p_source_type text,
  p_source_key text,
  p_payload jsonb default '{}'::jsonb
)
returns text
language plpgsql
as $$
declare
  v_text text;
begin
  if p_source_type = 'query' then
    return coalesce(p_payload->>'query_text', '');
  end if;

  if p_source_type = 'success_query' then
    return concat_ws(E'\n', p_payload->>'query_text', p_payload->>'intent');
  end if;

  begin
    set local lock_timeout = '500ms';
    select z.content into v_text
    from public.zorg_memory_search_mv z
    where z.source_table = p_source_type
      and z.source_id = p_source_key
    order by z.event_ts desc nulls last
    limit 1;
  exception
    when lock_not_available then
      v_text := null;
  end;

  return coalesce(
    nullif(v_text, ''),
    nullif(p_payload->>'query_text', ''),
    nullif(p_payload->>'intent', ''),
    nullif(p_payload->>'memory_key', ''),
    nullif(p_payload->>'category', ''),
    p_payload::text
  );
end;
$$;
