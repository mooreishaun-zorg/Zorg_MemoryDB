-- Rank-preserving recall tuning for exact/project aliases.
--
-- This keeps source memory intact and adds only derived/indexed recall support:
-- - project aliases can short-circuit broad recall when the operator names a
--   known project, backup, host, or recovery target;
-- - recall_context preserves source ranking instead of sorting by ids before
--   LIMIT;
-- - small trigram indexes support alias/fact/source-chunk lookup.

CREATE INDEX IF NOT EXISTS idx_memory_project_aliases_alias_norm_trgm
  ON public.memory_project_aliases USING gin (alias_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_zorg_operational_facts_value_trgm
  ON public.zorg_operational_facts USING gin (fact_value gin_trgm_ops) WHERE active;

CREATE INDEX IF NOT EXISTS idx_memory_source_chunks_content_trgm
  ON public.memory_source_chunks USING gin (content gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.memory_recall_exact_alias_v1(p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(source_type text, source_id text, path text, line_start integer, line_end integer, priority text, content text, score numeric, score_reason text, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_query_hash text := md5(lower(btrim(coalesce(p_query, ''))));
  v_limit integer := greatest(coalesce(p_limit, 10), 1);
BEGIN
  RETURN QUERY
  WITH exact_hints AS MATERIALIZED (
    SELECT h.id, h.source_type, h.source_key, h.hint_kind, h.hint_text, h.weight, h.updated_at
    FROM public.memory_recall_hints h
    WHERE coalesce(h.active, true)
      AND h.hint_kind IN ('exact_query_alias', 'operator_exact_alias')
      AND md5(lower(btrim(h.hint_text))) = v_query_hash
      AND lower(btrim(h.hint_text)) = v_query
    ORDER BY h.weight DESC, h.updated_at DESC
    LIMIT greatest(v_limit * 2, 10)
  ), project_aliases AS MATERIALIZED (
    SELECT a.id, a.project_key, a.alias, a.alias_norm, a.alias_type, a.created_at,
      CASE
        WHEN a.alias_norm = v_query THEN 990::numeric
        WHEN v_query LIKE '%' || a.alias_norm || '%' THEN 940::numeric
        WHEN a.alias_norm LIKE '%' || v_query || '%' THEN 900::numeric
        WHEN a.alias_norm % v_query THEN 820::numeric
        ELSE 0::numeric
      END AS alias_score
    FROM public.memory_project_aliases a
    WHERE length(v_query) >= 3
      AND (
        a.alias_norm = v_query
        OR v_query LIKE '%' || a.alias_norm || '%'
        OR a.alias_norm LIKE '%' || v_query || '%'
        OR a.alias_norm % v_query
      )
    ORDER BY alias_score DESC, a.created_at DESC
    LIMIT greatest(v_limit * 2, 10)
  ), linked_rules AS (
    SELECT
      'logic_rule'::text AS source_type,
      r.id::text AS source_id,
      NULL::text AS path,
      NULL::integer AS line_start,
      NULL::integer AS line_end,
      coalesce(r.priority::text, 'critical') AS priority,
      left(concat_ws(E'\n',
        'Logic rule: ' || coalesce(r.title, r.rule_key),
        'Key: ' || r.rule_key,
        'Rule: ' || r.rule_text
      ), 4000) AS content,
      (1000 + coalesce(h.weight, 0))::numeric AS score,
      'exact recall hint linked logic rule'::text AS score_reason,
      jsonb_build_object('hint_id', h.id, 'hint_kind', h.hint_kind, 'source_key', h.source_key) AS metadata
    FROM exact_hints h
    JOIN public.zorg_logic_rules r
      ON h.source_type = 'logic_rule'
     AND r.rule_key = h.source_key
     AND coalesce(r.active, true)
  ), linked_memories AS (
    SELECT
      'memory'::text AS source_type,
      z.id::text AS source_id,
      NULL::text AS path,
      NULL::integer AS line_start,
      NULL::integer AS line_end,
      coalesce(z.memory_priority, 'critical') AS priority,
      left(coalesce(z.memory_value, z.chat_session_log, ''), 4000) AS content,
      (950 + coalesce(h.weight, 0))::numeric AS score,
      'exact recall hint linked memory row'::text AS score_reason,
      jsonb_build_object('hint_id', h.id, 'hint_kind', h.hint_kind, 'source_key', h.source_key) AS metadata
    FROM exact_hints h
    JOIN public.zorg_memory z
      ON h.source_type IN ('memory', 'zorg_memory', 'recall_hint')
     AND z.memory_key = h.source_key
     AND coalesce(z.memory_active, true)
  ), alias_memory_rows AS (
    SELECT
      'zorg_memory'::text AS source_type,
      z.id::text AS source_id,
      NULL::text AS path,
      NULL::integer AS line_start,
      NULL::integer AS line_end,
      coalesce(z.memory_priority, 'high') AS priority,
      left(coalesce(z.memory_value, z.chat_session_log, ''), 4000) AS content,
      (a.alias_score + 40)::numeric AS score,
      'project alias linked memory row'::text AS score_reason,
      jsonb_build_object('alias_id', a.id, 'alias', a.alias, 'project_key', a.project_key) AS metadata
    FROM project_aliases a
    JOIN public.zorg_memory z
      ON z.memory_key = a.project_key
     AND coalesce(z.memory_active, true)
  ), alias_operational_facts AS (
    SELECT
      'operational_fact'::text AS source_type,
      f.id::text AS source_id,
      NULL::text AS path,
      NULL::integer AS line_start,
      NULL::integer AS line_end,
      coalesce(f.fact_priority, 'high') AS priority,
      left(f.fact_value, 4000) AS content,
      (a.alias_score + 60)::numeric AS score,
      'project alias linked operational fact'::text AS score_reason,
      jsonb_build_object('alias_id', a.id, 'alias', a.alias, 'project_key', a.project_key) AS metadata
    FROM project_aliases a
    JOIN public.zorg_operational_facts f
      ON f.fact_key = a.project_key
     AND coalesce(f.active, true)
  ), alias_rows AS (
    SELECT
      'project_alias'::text AS source_type,
      a.id::text AS source_id,
      NULL::text AS path,
      NULL::integer AS line_start,
      NULL::integer AS line_end,
      'high'::text AS priority,
      left(concat_ws(E'\n', a.project_key, a.alias, coalesce(a.alias_type, 'alias')), 4000) AS content,
      a.alias_score::numeric AS score,
      'project alias exact/fuzzy match'::text AS score_reason,
      jsonb_build_object('alias_id', a.id, 'alias', a.alias, 'project_key', a.project_key) AS metadata
    FROM project_aliases a
  ), hint_rows AS (
    SELECT
      'recall_hint'::text AS source_type,
      h.id::text AS source_id,
      NULL::text AS path,
      NULL::integer AS line_start,
      NULL::integer AS line_end,
      'critical'::text AS priority,
      left(concat_ws(E'\n', h.source_key, h.hint_kind, h.hint_text), 4000) AS content,
      (900 + coalesce(h.weight, 0))::numeric AS score,
      'exact recall hint row'::text AS score_reason,
      jsonb_build_object('hint_id', h.id, 'hint_kind', h.hint_kind, 'source_key', h.source_key) AS metadata
    FROM exact_hints h
  )
  SELECT * FROM linked_rules
  UNION ALL SELECT * FROM linked_memories
  UNION ALL SELECT * FROM alias_operational_facts
  UNION ALL SELECT * FROM alias_memory_rows
  UNION ALL SELECT * FROM alias_rows
  UNION ALL SELECT * FROM hint_rows
  ORDER BY score DESC
  LIMIT v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.zorg_recall_context(p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(source_type text, source_id text, path text, line_start integer, line_end integer, priority text, content text)
 LANGUAGE sql
AS $function$
  WITH combined AS (
    SELECT 0 AS branch_rank, row_number() OVER () AS inner_rank, *
    FROM public.zorg_get_logic_context(p_query, greatest(1, coalesce(p_limit, 10) / 3))
    UNION ALL
    SELECT 1 AS branch_rank, row_number() OVER () AS inner_rank, *
    FROM public.zorg_get_runbook_context(p_query, greatest(1, coalesce(p_limit, 10) / 2))
    UNION ALL
    SELECT 2 AS branch_rank, row_number() OVER () AS inner_rank, *
    FROM public.zorg_get_project_context(p_query, greatest(1, coalesce(p_limit, 10) / 2))
    UNION ALL
    SELECT 3 AS branch_rank, row_number() OVER () AS inner_rank, *
    FROM public.zorg_get_host_context(p_query, greatest(1, coalesce(p_limit, 10) / 3))
    UNION ALL
    SELECT
      4 + row_number() OVER (ORDER BY z.event_ts DESC) AS branch_rank,
      row_number() OVER () AS inner_rank,
      CASE z.source_table
        WHEN 'directive' THEN 'directive'
        WHEN 'runbook' THEN 'runbook'
        WHEN 'project' THEN 'project'
        WHEN 'project_fact' THEN 'project_fact'
        WHEN 'project_alias' THEN 'project_alias'
        WHEN 'host' THEN 'host'
        WHEN 'service' THEN 'service'
        WHEN 'relationship' THEN 'relationship'
        WHEN 'operational_fact' THEN 'operational_fact'
        WHEN 'contact' THEN 'contact'
        WHEN 'logic_rule' THEN 'logic_rule'
        WHEN 'source_chunk' THEN 'source_chunk'
        WHEN 'zorg_memory' THEN 'zorg_memory'
        ELSE 'memory'
      END AS source_type,
      z.source_id,
      NULL::text AS path,
      NULL::integer AS line_start,
      NULL::integer AS line_end,
      coalesce(z.priority, 'medium') AS priority,
      z.snippet AS content
    FROM public.zorg_search_memory(p_query, greatest(coalesce(p_limit, 10) * 3, 20)) z
  ), ranked AS (
    SELECT c.*,
      row_number() OVER (
        PARTITION BY c.source_type, c.source_id
        ORDER BY
          CASE WHEN lower(c.priority) = 'critical' THEN 0
               WHEN lower(c.priority) = 'high' THEN 1
               WHEN lower(c.priority) = 'medium' THEN 2
               ELSE 3 END,
          c.branch_rank,
          c.inner_rank
      ) AS dedupe_rank
    FROM combined c
  )
  SELECT source_type, source_id, path, line_start, line_end, priority, content
  FROM ranked
  WHERE dedupe_rank = 1
  ORDER BY
    branch_rank,
    CASE WHEN lower(priority) = 'critical' THEN 0
         WHEN lower(priority) = 'high' THEN 1
         WHEN lower(priority) = 'medium' THEN 2
         ELSE 3 END,
    inner_rank
  LIMIT greatest(coalesce(p_limit, 10), 1);
$function$;

ANALYZE public.memory_project_aliases;
ANALYZE public.zorg_operational_facts;
ANALYZE public.memory_source_chunks;
