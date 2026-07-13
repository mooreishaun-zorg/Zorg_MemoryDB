-- Bound fast materialized-view recall for long natural-language queries.
-- Keep the SQL in PostgreSQL, but avoid unbounded token LIKE scans.

CREATE OR REPLACE FUNCTION public.memory_recall_fast_mv_v1(
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
  v_query text := coalesce(p_query, '');
  v_limit integer := greatest(coalesce(p_limit, 10), 1);
  v_phrase text := lower(left(coalesce(p_query, ''), 96));
BEGIN
  RETURN QUERY
  WITH tokens AS MATERIALIZED (
    SELECT token FROM public.memory_recall_tokens_v1(v_query, 8)
  ), candidates AS MATERIALIZED (
    SELECT
      z.source_table,
      z.source_id,
      z.priority,
      left(z.content, 4000) AS content,
      z.source_rank,
      z.priority_rank,
      z.event_ts,
      z.content_len,
      (
        SELECT count(*)::integer
        FROM tokens t
        WHERE z.content_lc LIKE '%' || t.token || '%'
      ) AS token_hits,
      CASE WHEN z.content_fts_simple @@ plainto_tsquery('simple', v_query) THEN 1 ELSE 0 END AS fts_hit,
      CASE
        WHEN length(v_phrase) BETWEEN 12 AND 96 AND z.content_lc LIKE '%' || v_phrase || '%' THEN 2
        ELSE 0
      END AS phrase_hit
    FROM public.zorg_memory_search_fast_mv z
    WHERE z.content_fts_simple @@ plainto_tsquery('simple', v_query)
       OR (
          length(v_phrase) BETWEEN 12 AND 96
          AND z.content_lc LIKE '%' || v_phrase || '%'
       )
    ORDER BY
      CASE WHEN z.content_fts_simple @@ plainto_tsquery('simple', v_query) THEN 0 ELSE 1 END,
      z.priority_rank,
      z.source_rank,
      z.event_ts DESC NULLS LAST
    LIMIT greatest(v_limit * 12, 80)
  ), scored AS (
    SELECT
      public.memory_recall_source_type(c.source_table) AS source_type,
      c.source_id,
      NULL::text AS path,
      NULL::integer AS line_start,
      NULL::integer AS line_end,
      coalesce(c.priority, 'medium') AS priority,
      c.content,
      (
        ((c.token_hits + c.fts_hit + c.phrase_hit)::numeric
          * greatest(1, 10 - c.priority_rank * 2)
          * greatest(1, 10 - c.source_rank))
        / greatest(c.content_len, 100)
      ) AS score,
      concat_ws(',', 'fast_mv_bounded', 'tokens=' || c.token_hits, 'fts=' || c.fts_hit, 'phrase=' || c.phrase_hit) AS score_reason,
      jsonb_build_object(
        'source_table', c.source_table,
        'source_rank', c.source_rank,
        'priority_rank', c.priority_rank,
        'token_hits', c.token_hits,
        'fts_hit', c.fts_hit,
        'phrase_hit', c.phrase_hit
      ) AS metadata
    FROM candidates c
  )
  SELECT *
  FROM scored s
  WHERE s.score > 0
  ORDER BY s.score DESC, s.priority, s.source_id
  LIMIT v_limit;
END;
$$;
