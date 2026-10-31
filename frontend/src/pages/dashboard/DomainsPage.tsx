import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Globe, Plus, Loader2, RefreshCw, Trash2, Copy, Check, AlertTriangle, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ApiError,
  addCustomDomain,
  checkCustomDomain,
  getCustomDomains,
  removeCustomDomain,
  setDefaultCustomDomain,
  type CustomDomain,
} from "@/lib/api"

/**
 * Custom domains (backend custom-domain.service.ts): print codes as
 * https://qr.yourbrand.com/r/<code> instead of genxqr.com. The customer adds one
 * CNAME record; Cloudflare issues HTTPS. Personal to the account, like billing.
 */

function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
      }}
      className="inline-flex items-center gap-1 text-xs text-violet-500 hover:text-violet-400"
      aria-label={`Copy ${value}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

function StatusBadge({ status }: { status: CustomDomain["status"] }) {
  if (status === "active") return <Badge variant="success">Verified</Badge>
  if (status === "failed") return <Badge variant="destructive">Needs attention</Badge>
  return <Badge variant="warning">Waiting for DNS</Badge>
}

/** "qr" for qr.brand.com — what most DNS providers want in the Name field. */
function recordName(hostname: string): string {
  return hostname.split(".").slice(0, -2).join(".") || hostname
}

function DomainRow({ d, target, onError }: { d: CustomDomain; target: string | null; onError: (msg: string) => void }) {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ["custom-domains"] })
  const fail = (err: unknown) => onError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")

  const check = useMutation({ mutationFn: () => checkCustomDomain(d.id), onSuccess: refresh, onError: fail })
  const makeDefault = useMutation({ mutationFn: () => setDefaultCustomDomain(d.id), onSuccess: refresh, onError: fail })
  const remove = useMutation({
    mutationFn: () => removeCustomDomain(d.id),
    onSuccess: () => { setConfirming(false); refresh(); qc.invalidateQueries({ queryKey: ["qrs"] }) },
    onError: fail,
  })

  return (
    <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 last:border-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-mono text-sm text-zinc-900 dark:text-white break-all">{d.hostname}</span>
          <StatusBadge status={d.status} />
          {d.isDefault && <Badge variant="secondary">Default</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {d.status !== "active" && (
            <Button variant="outline" className="h-8 text-xs px-3 gap-1.5" onClick={() => check.mutate()} disabled={check.isPending}>
              {check.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Check now
            </Button>
          )}
          {d.status === "active" && !d.isDefault && (
            <Button variant="outline" className="h-8 text-xs px-3 gap-1.5" onClick={() => makeDefault.mutate()} disabled={makeDefault.isPending}>
              <Star size={13} /> Make default
            </Button>
          )}
          <Button variant="ghost" className="h-8 text-xs px-3 gap-1.5 text-red-500 hover:text-red-400" onClick={() => setConfirming(true)}>
            <Trash2 size={13} /> Remove
          </Button>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        {d.codeCount === 0 ? "No codes use this domain yet." : `${d.codeCount} code${d.codeCount === 1 ? "" : "s"} print with this domain.`}
      </p>

      {d.status !== "active" && target && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 text-xs space-y-2">
          <p className="text-zinc-700 dark:text-zinc-300">Add this record where you manage DNS for your domain:</p>
          <div className="overflow-x-auto">
            <table className="text-left">
              <thead><tr className="text-zinc-500"><th className="pr-6 font-medium">Type</th><th className="pr-6 font-medium">Name</th><th className="font-medium">Target / value</th></tr></thead>
              <tbody>
                <tr className="font-mono text-zinc-900 dark:text-white">
                  <td className="pr-6 py-1">CNAME</td>
                  <td className="pr-6 py-1">{recordName(d.hostname)} <CopyText value={recordName(d.hostname)} /></td>
                  <td className="py-1">{target} <CopyText value={target} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-zinc-500">If your DNS is on Cloudflare, set the record to <strong>DNS only</strong> (grey cloud). DNS changes can take from a few minutes to a day; we check automatically every 10 minutes, and HTTPS is set up for you once the record is found.</p>
        </div>
      )}

      {d.verificationErrors && d.verificationErrors.length > 0 && d.status !== "active" && (
        <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
          {d.verificationErrors.map((e) => <li key={e} className="flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{e}</li>)}
        </ul>
      )}

      {confirming && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-2">
          <p className="text-zinc-800 dark:text-zinc-200">
            Remove <strong>{d.hostname}</strong>?{" "}
            {d.codeCount > 0
              ? `Its ${d.codeCount} code${d.codeCount === 1 ? "" : "s"} will switch to genxqr.com links. Codes already printed with ${d.hostname} will stop working.`
              : "Nothing uses it yet."}
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" className="h-8 text-xs px-3" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? <Loader2 size={13} className="animate-spin" /> : "Remove domain"}
            </Button>
            <Button variant="outline" className="h-8 text-xs px-3" onClick={() => setConfirming(false)}>Keep it</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DomainsPage() {
  const qc = useQueryClient()
  const [hostname, setHostname] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const { data, isLoading, error } = useQuery({ queryKey: ["custom-domains"], queryFn: getCustomDomains })
  const list = data?.data

  const add = useMutation({
    mutationFn: () => addCustomDomain(hostname),
    onSuccess: () => { setHostname(""); setMessage(null); qc.invalidateQueries({ queryKey: ["custom-domains"] }) },
    onError: (err) => setMessage(err instanceof ApiError ? err.message : "Could not add the domain. Please try again."),
  })

  const used = list?.domains.length ?? 0
  const limit = list?.limit ?? 0
  const canAdd = !!list && list.available && limit > 0 && used < limit

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Custom domains</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Print your QR codes with your own link, like <span className="font-mono">qr.yourbrand.com/r/menu</span>, instead of genxqr.com.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center text-zinc-500 text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading…</div>
      )}
      {error && <p className="text-sm text-red-500">Could not load your domains. Please refresh the page.</p>}

      {list && limit === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Globe size={28} className="text-zinc-400 mx-auto" />
            <p className="text-zinc-900 dark:text-white font-semibold">Custom domains come with the Pro plan</p>
            <p className="text-zinc-500 text-sm">Pro includes 1 domain, Business 5 and Enterprise 25.</p>
            <a href="/app/billing" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
              See plans
            </a>
          </CardContent>
        </Card>
      )}

      {list && limit > 0 && (
        <>
          {!list.available && (
            <p className="text-sm rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-300">
              Adding domains is switched off for a moment while we finish setting it up. Please check back soon.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Globe size={16} className="text-violet-400" /> Your domains</span>
                <span className="text-xs font-normal text-zinc-500">{used} of {limit} used</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <form
                className="flex flex-col sm:flex-row gap-2 px-5 pb-4"
                onSubmit={(e) => { e.preventDefault(); if (hostname.trim() && canAdd) add.mutate() }}
              >
                <label htmlFor="domain-input" className="sr-only">Domain</label>
                <Input
                  id="domain-input"
                  placeholder="qr.yourbrand.com"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  disabled={!canAdd}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" className="shrink-0 gap-1.5" disabled={!canAdd || !hostname.trim() || add.isPending}>
                  {add.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Add domain
                </Button>
              </form>
              {used >= limit && list.available && (
                <p className="px-5 pb-4 text-xs text-zinc-500">You've used all the domains on your plan. Remove one or upgrade to add another.</p>
              )}
              {message && <p className="px-5 pb-4 text-sm text-red-500">{message}</p>}

              {list.domains.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-zinc-500 border-t border-zinc-200 dark:border-zinc-800">
                  No domains yet. Use a subdomain such as <span className="font-mono">qr.yourbrand.com</span>; your main website keeps working as it is.
                </p>
              ) : (
                <div className="border-t border-zinc-200 dark:border-zinc-800">
                  {list.domains.map((d) => <DomainRow key={d.id} d={d} target={list.target} onError={setMessage} />)}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-900 dark:text-white">How it works</p>
            <p>New codes use your default domain; you can pick a different one, or genxqr.com, when creating or editing a code. Your genxqr.com links always keep working. On your domain only your own codes open — nobody else's code can appear under your brand.</p>
          </div>
        </>
      )}
    </div>
  )
}
