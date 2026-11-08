import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Bot, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ApiError, answerOAuthRequest, getOAuthRequest } from "@/lib/api"

/**
 * /app/oauth/authorize?request=… — "Sign in with GenXQR" for an AI app (backend
 * oauth.service.ts). The app sent the person here; approving gives it access to
 * their own account's codes and sends them back to it.
 */
export default function OAuthAuthorizePage() {
  const requestId = useSearchParams()[0].get("request") ?? ""
  const [leaving, setLeaving] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: ["oauth-request", requestId],
    queryFn: () => getOAuthRequest(requestId),
    enabled: !!requestId,
    retry: false,
  })
  const answer = useMutation({
    mutationFn: (approve: boolean) => answerOAuthRequest(requestId, approve),
    onSuccess: (res) => {
      setLeaving(true)
      window.location.href = res.data.redirect
    },
  })
  const req = data?.data

  const problem = !requestId
    ? "This link is missing its sign-in request. Start again from the app."
    : error instanceof ApiError ? error.message : error ? "Could not load this request." : null

  return (
    <div className="max-w-md mx-auto py-10 animate-fade-in">
      <Card>
        <CardContent className="p-6 space-y-5">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-zinc-400" /></div>
          ) : problem ? (
            <div className="text-center space-y-3 py-6">
              <XCircle size={36} className="mx-auto text-zinc-400" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{problem}</p>
              <Link to="/app/api-keys" className="text-sm text-violet-500 hover:underline">Connected AI apps</Link>
            </div>
          ) : leaving ? (
            <div className="text-center space-y-3 py-6">
              <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Returning you to {req?.clientName}…</p>
            </div>
          ) : req && (
            <>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-violet-500/15 flex items-center justify-center"><Bot size={22} className="text-violet-500" /></div>
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Connect {req.clientName}?</h1>
                  <p className="text-xs text-zinc-500 truncate">Returns to {req.redirectHost}</p>
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-700 dark:text-zinc-300 space-y-2">
                <p className="font-medium text-zinc-900 dark:text-white">It will be able to, on your own account:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>see your QR codes, places, folders and scan analytics</li>
                  <li>create, edit, switch on/off and delete QR codes</li>
                </ul>
                <p className="text-xs text-zinc-500 pt-1 flex items-start gap-1.5">
                  <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                  It never sees your password. Disconnect it any time under API Keys → Connected AI apps.
                </p>
              </div>
              {!req.planAllows ? (
                <div className="space-y-3">
                  <p className="text-sm text-amber-600 dark:text-amber-400">Connecting AI apps needs API access, which comes with the Pro plan or higher.</p>
                  <div className="flex gap-2">
                    <Link to="/app/billing" className="flex-1"><Button className="w-full">See plans</Button></Link>
                    <Button variant="outline" onClick={() => answer.mutate(false)} disabled={answer.isPending}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button className="flex-1 gap-1.5" onClick={() => answer.mutate(true)} disabled={answer.isPending}>
                    {answer.isPending && <Loader2 size={14} className="animate-spin" />} Allow
                  </Button>
                  <Button variant="outline" onClick={() => answer.mutate(false)} disabled={answer.isPending}>Deny</Button>
                </div>
              )}
              {answer.error && <p className="text-sm text-red-500">{answer.error instanceof ApiError ? answer.error.message : "Something went wrong."}</p>}
              <p className="text-xs text-zinc-500">Only approve apps you opened yourself. If you didn't just ask an app to connect to GenXQR, choose Deny.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
