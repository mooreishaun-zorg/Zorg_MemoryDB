-- Public-safe DB-owned LLM due-job enqueue helper.
-- This file intentionally defines generic queue timing helpers only; it does
-- not install operator-specific scheduled jobs or private prompts.

CREATE OR REPLACE FUNCTION public.memory_llm_next_due_v1(
  p_schedule jsonb,
  p_from timestamptz DEFAULT now()
) RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind text := coalesce(p_schedule->>'kind', '');
  v_every_ms numeric;
  v_at timestamptz;
BEGIN
  IF v_kind = 'every' THEN
    v_every_ms := nullif(p_schedule->>'everyMs', '')::numeric;
    IF v_every_ms IS NULL OR v_every_ms <= 0 THEN
      RAISE EXCEPTION 'invalid every schedule: %', p_schedule;
    END IF;
    RETURN p_from + make_interval(secs => (v_every_ms / 1000.0)::double precision);
  END IF;

  IF v_kind = 'at' THEN
    v_at := nullif(p_schedule->>'at', '')::timestamptz;
    RETURN v_at;
  END IF;

  IF v_kind = 'cron' THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'unsupported schedule kind: % schedule=%', v_kind, p_schedule;
END;
$$;

CREATE OR REPLACE FUNCTION public.memory_llm_enqueue_due_jobs_v1(
  p_limit integer DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
  v_queue_id uuid;
  v_enqueued jsonb := '[]'::jsonb;
  v_seen integer := 0;
BEGIN
  FOR v_job IN
    SELECT job_key, schedule
    FROM public.memory_llm_scheduled_jobs
    WHERE enabled
      AND next_due_at IS NOT NULL
      AND next_due_at <= now()
    ORDER BY next_due_at, job_key
    LIMIT greatest(coalesce(p_limit, 25), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_seen := v_seen + 1;
    v_queue_id := public.memory_llm_enqueue_job(v_job.job_key);
    UPDATE public.memory_llm_scheduled_jobs
    SET next_due_at = public.memory_llm_next_due_v1(v_job.schedule, now()),
        updated_at = now()
    WHERE job_key = v_job.job_key;

    IF v_queue_id IS NOT NULL THEN
      v_enqueued := v_enqueued || jsonb_build_array(
        jsonb_build_object('job_key', v_job.job_key, 'queue_id', v_queue_id)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'due_seen', v_seen,
    'enqueued_count', jsonb_array_length(v_enqueued),
    'enqueued', v_enqueued
  );
END;
$$;
