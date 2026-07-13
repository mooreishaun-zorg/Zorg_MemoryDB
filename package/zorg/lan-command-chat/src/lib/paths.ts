import path from "node:path";

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function getWorkspaceDir() {
  return firstNonEmpty(
    process.env.OPENCLAW_WORKSPACE,
    process.env.WORKSPACE_DIR,
    process.env.OPENCLAW_WORKSPACE_DIR,
  ) ?? path.join(process.env.HOME || process.cwd(), ".openclaw", "workspace");
}

export function getIdentityPath() {
  return path.join(getWorkspaceDir(), "IDENTITY.md");
}

export function getHostUploadDir() {
  return firstNonEmpty(process.env.HOST_UPLOAD_DIR) ?? path.join(getWorkspaceDir(), "lan-chat", "uploads");
}

export function getSqlMemoryMapPath() {
  return firstNonEmpty(
    process.env.SQL_MEMORY_MAP,
    process.env.ZORG_SQL_MEMORY_MAP,
  ) ?? path.join(getWorkspaceDir(), "sql_memory_map.json");
}

export function getOpenClawHome() {
  return firstNonEmpty(process.env.OPENCLAW_HOME) ?? path.join(process.env.HOME || process.cwd(), ".openclaw");
}

export function getOpenClawSessionsDir() {
  return firstNonEmpty(process.env.OPENCLAW_SESSIONS_DIR) ?? path.join(getOpenClawHome(), "agents", "main", "sessions");
}
