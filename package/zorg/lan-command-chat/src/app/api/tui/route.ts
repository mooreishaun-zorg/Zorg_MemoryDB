import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceDir } from "@/lib/paths";

const execFileAsync = promisify(execFile);

const SESSION = process.env.LAN_CHAT_TUI_TMUX_SESSION || "lan-chat-openclaw-tui";
const WORKSPACE = getWorkspaceDir();
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
const TUI_COMMAND = `cd ${shellQuote(WORKSPACE)} && ${shellQuote(OPENCLAW_BIN)} tui`;
const CAPTURE_LINES = 70;
const MAX_INPUT_LENGTH = 2000;

type TuiAction = "start" | "restart" | "send" | "key";

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function tmux(args: string[]) {
  return execFileAsync("tmux", args, {
    timeout: 8000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      TERM: process.env.TERM || "xterm-256color",
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    },
  });
}

async function hasSession() {
  try {
    await tmux(["has-session", "-t", SESSION]);
    return true;
  } catch {
    return false;
  }
}

async function startSession() {
  if (await hasSession()) return;
  await tmux(["new-session", "-d", "-s", SESSION, "-x", "120", "-y", "42", TUI_COMMAND]);
}

async function restartSession() {
  if (await hasSession()) {
    await tmux(["kill-session", "-t", SESSION]);
  }
  await tmux(["new-session", "-d", "-s", SESSION, "-x", "120", "-y", "42", TUI_COMMAND]);
}

async function capture() {
  await startSession();
  const { stdout } = await tmux(["capture-pane", "-p", "-t", SESSION, "-S", `-${CAPTURE_LINES}`]);
  return stdout
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .split("\n")
    .slice(-CAPTURE_LINES)
    .join("\n")
    .trimEnd();
}

async function sendInput(input: string) {
  const trimmed = input.slice(0, MAX_INPUT_LENGTH);
  if (!trimmed) return;
  await startSession();
  await tmux(["send-keys", "-t", SESSION, "--", trimmed, "Enter"]);
}

async function sendKey(key: string) {
  const allowed: Record<string, string> = {
    enter: "Enter",
    escape: "Escape",
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    tab: "Tab",
    ctrlc: "C-c",
  };
  const tmuxKey = allowed[key.toLowerCase()];
  if (!tmuxKey) throw new Error("Unsupported key");
  await startSession();
  await tmux(["send-keys", "-t", SESSION, tmuxKey]);
}

async function payload() {
  const active = await hasSession();
  const screen = await capture();
  return {
    active: active || (await hasSession()),
    session: SESSION,
    command: "openclaw tui",
    sampledAt: new Date().toISOString(),
    screen,
  };
}

export async function GET() {
  try {
    return NextResponse.json(await payload());
  } catch (error) {
    return NextResponse.json(
      { active: false, error: error instanceof Error ? error.message : "TUI unavailable", sampledAt: new Date().toISOString() },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = (body?.action || "send") as TuiAction;
    if (action === "restart") await restartSession();
    else if (action === "start") await startSession();
    else if (action === "key") await sendKey(String(body?.key || ""));
    else await sendInput(String(body?.input || ""));
    return NextResponse.json(await payload());
  } catch (error) {
    return NextResponse.json(
      { active: false, error: error instanceof Error ? error.message : "TUI command failed", sampledAt: new Date().toISOString() },
      { status: 500 },
    );
  }
}
