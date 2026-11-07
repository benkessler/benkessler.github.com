import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./config.js";

/**
 * Plain files on purpose: memory is markdown you can open, read and edit by hand.
 * Swap for Postgres when you run many deployments on one box; the interface stays the same.
 *
 *   data/memory/org.md               tools, naming, preferences, people
 *   data/memory/clients/<slug>.md    per-client context
 *   data/state.json                  job checkpoints ("meetings already prepped", last sweep findings)
 *   data/approvals.json              pending / decided approval requests
 *   data/changes.jsonl               log of changes actually made (feeds weekly reports)
 *   data/workspace/                  scratch space the agent can read and write
 */

const p = (...parts: string[]) => join(env.dataDir, ...parts);

function ensure(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}
function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(path: string, value: unknown) {
  ensure(path);
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export const workspaceDir = () => {
  const dir = p("workspace");
  mkdirSync(dir, { recursive: true });
  return dir;
};

// ---------- memory ----------
export type MemoryScope = "org" | `client:${string}`;
const memoryPath = (scope: MemoryScope) =>
  scope === "org" ? p("memory", "org.md") : p("memory", "clients", `${scope.slice("client:".length)}.md`);

export function readMemory(scope: MemoryScope): string {
  const path = memoryPath(scope);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Upsert a `## Section` in a memory file, or append a bullet to it. */
export function writeMemory(scope: MemoryScope, section: string, content: string, mode: "append" | "replace") {
  const path = memoryPath(scope);
  ensure(path);
  const doc = readMemory(scope);
  const header = `## ${section.trim()}`;
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => l.trim().toLowerCase() === header.toLowerCase());
  let next: string;
  if (start === -1) {
    next = `${doc.trimEnd()}\n\n${header}\n${content.trim()}\n`.trimStart();
  } else {
    let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
    if (end === -1) end = lines.length;
    const existing = lines.slice(start + 1, end).join("\n").trim();
    const body = mode === "append" && existing ? `${existing}\n${content.trim()}` : content.trim();
    const before = lines.slice(0, start + 1).join("\n");
    const after = lines.slice(end).join("\n").trim();
    next = `${before}\n${body}\n${after ? `\n${after}\n` : ""}`;
  }
  writeFileSync(path, next);
}

// ---------- state ----------
type State = Record<string, unknown>;
export function getState<T = unknown>(key: string): T | undefined {
  return readJson<State>(p("state.json"), {})[key] as T | undefined;
}
export function setState(key: string, value: unknown) {
  const s = readJson<State>(p("state.json"), {});
  s[key] = value;
  writeJson(p("state.json"), s);
}

// ---------- approvals ----------
export type Approval = {
  id: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "failed" | "done";
  title: string;
  why: string;
  client?: string;
  toolSlug: string;
  arguments: Record<string, unknown>;
  slack?: { channel: string; ts: string };
  decidedBy?: string;
  result?: string;
};
const approvalsPath = () => p("approvals.json");
export function createApproval(a: Omit<Approval, "id" | "createdAt" | "status">): Approval {
  const all = readJson<Approval[]>(approvalsPath(), []);
  const approval: Approval = { ...a, id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), status: "pending" };
  all.push(approval);
  writeJson(approvalsPath(), all);
  return approval;
}
export function getApproval(id: string) {
  return readJson<Approval[]>(approvalsPath(), []).find((a) => a.id === id);
}
export function updateApproval(id: string, patch: Partial<Approval>) {
  const all = readJson<Approval[]>(approvalsPath(), []);
  const i = all.findIndex((a) => a.id === id);
  if (i === -1) return undefined;
  all[i] = { ...all[i], ...patch };
  writeJson(approvalsPath(), all);
  return all[i];
}
export function listApprovals(status?: Approval["status"]) {
  return readJson<Approval[]>(approvalsPath(), []).filter((a) => !status || a.status === status);
}

// ---------- change log ----------
export type Change = { at: string; client?: string; what: string; tool?: string; approvalId?: string; source: "agent" | "observed" };
export function logChange(c: Omit<Change, "at">) {
  const path = p("changes.jsonl");
  ensure(path);
  appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...c }) + "\n");
}
export function readChanges(sinceIso?: string, client?: string): Change[] {
  const path = p("changes.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Change)
    .filter((c) => (!sinceIso || c.at >= sinceIso) && (!client || c.client === client));
}

// ---------- Slack thread -> agent session (so follow-ups keep context) ----------
export function threadSession(threadKey: string): string | undefined {
  return readJson<Record<string, string>>(p("threads.json"), {})[threadKey];
}
export function setThreadSession(threadKey: string, sessionId: string) {
  const all = readJson<Record<string, string>>(p("threads.json"), {});
  all[threadKey] = sessionId;
  writeJson(p("threads.json"), all);
}
