import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { listWorkspaces, type WorkspaceRole, type WorkspaceSummary } from "@/lib/api"
import { getWorkspaceOwnerId, setWorkspaceOwnerId, subscribeWorkspace } from "@/lib/workspace"

export type WorkspaceAction = "qr:view" | "qr:create" | "qr:edit" | "qr:delete" | "team:manage"

// Mirrors backend services/workspace.service.ts PERMISSIONS. The server is the
// only real gate; this decides what the dashboard SHOWS.
const PERMISSIONS: Record<WorkspaceRole, readonly WorkspaceAction[]> = {
  OWNER: ["qr:view", "qr:create", "qr:edit", "qr:delete", "team:manage"],
  ADMIN: ["qr:view", "qr:create", "qr:edit", "qr:delete", "team:manage"],
  EDITOR: ["qr:view", "qr:create", "qr:edit"],
  VIEWER: ["qr:view"],
}

/**
 * The selected workspace and what your role in it allows.
 *
 * Fails OPEN while the list is loading (role OWNER) for the same reason as
 * usePlanFeature: the server refuses anything not allowed, so guessing
 * "allowed" costs at worst a 403, while guessing "locked" hides a team
 * member's tools because one request was slow.
 */
export function useWorkspace() {
  const queryClient = useQueryClient()
  const ownerId = useSyncExternalStore(subscribeWorkspace, getWorkspaceOwnerId, () => null)
  const { data } = useQuery({ queryKey: ["workspaces"], queryFn: listWorkspaces, staleTime: 60_000 })

  const workspaces: WorkspaceSummary[] = data?.data ?? []
  const personal = workspaces[0]
  const current = ownerId ? workspaces.find((w) => w.ownerId === ownerId) : personal
  const isPersonal = !ownerId || ownerId === personal?.ownerId

  // A selection that is no longer valid (left the team, removed, the owner's
  // plan dropped team seats) falls back to your own workspace.
  useEffect(() => {
    if (ownerId && data && (!current || !current.available)) setWorkspaceOwnerId(null)
  }, [ownerId, data, current])

  const role: WorkspaceRole = current?.role ?? "OWNER"
  const can = useCallback((action: WorkspaceAction) => PERMISSIONS[role].includes(action), [role])

  const switchTo = useCallback(
    (nextOwnerId: string | null) => {
      setWorkspaceOwnerId(nextOwnerId && nextOwnerId !== personal?.ownerId ? nextOwnerId : null)
      // Query keys do not include the workspace, so cached data from the old
      // one must go. The workspace list itself is unchanged; keep it.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "workspaces" })
    },
    [personal?.ownerId, queryClient],
  )

  return { workspaces, current, isPersonal, role, can, switchTo }
}
