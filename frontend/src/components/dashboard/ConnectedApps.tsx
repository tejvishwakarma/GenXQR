import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getOAuthConnections, revokeOAuthConnection } from "@/lib/api"

const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })

/** AI apps connected with "Sign in with GenXQR" (claude.ai, ChatGPT…), each disconnectable. */
export function ConnectedApps() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["oauth-connections"], queryFn: getOAuthConnections })
  const apps = data?.data ?? []
  const revoke = useMutation({
    mutationFn: (clientId: string) => revokeOAuthConnection(clientId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth-connections"] }),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Bot size={16} className="text-violet-400" /> Connected AI apps</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 size={16} className="animate-spin text-zinc-400" />
        ) : apps.length === 0 ? (
          <p className="text-sm text-zinc-500">
            None yet. Add GenXQR to claude.ai or ChatGPT as a custom connector with the URL <code className="text-violet-500">https://genxqr.com/v1/mcp</code> and sign in when asked — no API key needed.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {apps.map((a) => (
              <li key={a.clientId} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{a.name}</p>
                  <p className="text-xs text-zinc-500">Connected {when(a.connectedAt)}{a.lastUsedAt ? ` · last used ${when(a.lastUsedAt)}` : ""}</p>
                </div>
                <Button variant="outline" size="sm" className="text-red-500 shrink-0" disabled={revoke.isPending}
                  onClick={() => { if (window.confirm(`Disconnect ${a.name}? It loses access straight away.`)) revoke.mutate(a.clientId) }}>
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
