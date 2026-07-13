-- Keep the exact-alias recall layer stored-procedure-owned, but make it
-- bounded/indexable so email and cron preflights cannot stall on hint scans.

CREATE INDEX IF NOT EXISTS memory_recall_hints_exact_alias_norm_idx
ON public.memory_recall_hints (
  lower(btrim(hint_text)),
  hint_kind,
  source_type,
  source_key
)
WHERE coalesce(active, true)
  AND hint_kind IN ('exact_query_alias', 'operator_exact_alias');

CREATE INDEX IF NOT EXISTS memory_recall_hints_exact_alias_hash_idx
ON public.memory_recall_hints (
  md5(lower(btrim(hint_text))),
  hint_kind,
  source_type,
  source_key
)
WHERE coalesce(active, true)
  AND hint_kind IN ('exact_query_alias', 'operator_exact_alias');

CREATE OR REPLACE FUNCTION public.memory_recall_exact_alias_v1(
  p_query text,
  p_limit integer DEFAULT 10
) RETURNS TABLE(
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
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_query_hash text := md5(lower(btrim(coalesce(p_query, ''))));
  v_limit integer := greatest(coalesce(p_limit, 10), 1);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.memory_recall_hints h
    WHERE coalesce(h.active, true)
      AND h.hint_kind IN ('exact_query_alias', 'operator_exact_alias')
      AND md5(lower(btrim(h.hint_text))) = v_query_hash
      AND lower(btrim(h.hint_text)) = v_query
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

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
  UNION ALL
  SELECT * FROM linked_memories
  UNION ALL
  SELECT * FROM hint_rows
  ORDER BY score DESC
  LIMIT v_limit;
END;
$$;
