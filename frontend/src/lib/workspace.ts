/**
 * The selected team workspace (backend: middleware/workspace.middleware.ts).
 *
 * Stores the workspace OWNER's user id; null means your own workspace. Every
 * dashboard request carries it as X-Workspace-Id, and the server decides what
 * your role there lets you do — the dashboard only hides what you can't.
 *
 * Per-browser and per-tab-persistent via localStorage; cleared on logout so the
 * next person on the machine starts in their own workspace.
 */
import { readStoredValue } from "@/lib/utils"

const STORAGE_KEY = "gx_workspace"
const listeners = new Set<() => void>()

export function getWorkspaceOwnerId(): string | null {
  return readStoredValue(STORAGE_KEY)
}

export function setWorkspaceOwnerId(ownerId: string | null): void {
  try {
    if (ownerId) localStorage.setItem(STORAGE_KEY, ownerId)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage blocked: stays in the personal workspace */
  }
  listeners.forEach((l) => l())
}

export function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Header to send with dashboard requests; empty in your own workspace. */
export function workspaceHeader(): Record<string, string> {
  const ownerId = getWorkspaceOwnerId()
  return ownerId ? { "X-Workspace-Id": ownerId } : {}
}
