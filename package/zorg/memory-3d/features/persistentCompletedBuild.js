const configKey = "completed-build";

export function completedBuildConfigSignature(config = {}) {
  const historyWindow = config?.historyWindow || {};
  const buildSettings = config?.buildSettings || {};
  return [
    Number(historyWindow.days || 0).toFixed(4),
    Number(buildSettings.historyStageHours || 0).toFixed(4),
  ].join(":");
}

export async function ensurePersistentCompletedBuildTable(pool) {
  await pool.query(`
    create table if not exists zorg_memory_3d_completed_builds (
      build_key text primary key,
      config_signature text not null,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
}

export async function loadPersistentCompletedBuild(pool, config = {}) {
  const configSignature = completedBuildConfigSignature(config);
  const result = await pool.query(
    `
      select payload
      from zorg_memory_3d_completed_builds
      where build_key = $1 and config_signature = $2
      limit 1
    `,
    [configKey, configSignature],
  );
  const payload = result.rows[0]?.payload;
  if (!payload || typeof payload !== "object") return null;
  if (!Array.isArray(payload.nodes) || !Array.isArray(payload.links)) return null;
  return payload;
}

export async function savePersistentCompletedBuild(pool, config = {}, payload = {}) {
  if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.links)) return false;
  await pool.query(
    `
      insert into zorg_memory_3d_completed_builds (build_key, config_signature, payload, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (build_key)
      do update
      set config_signature = excluded.config_signature,
          payload = excluded.payload,
          updated_at = now()
    `,
    [configKey, completedBuildConfigSignature(config), JSON.stringify(payload)],
  );
  return true;
}
