import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import QRCodeStyling from "qr-code-styling"
import { AlertCircle, CheckCircle2, Copy, Download, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ApiError, disableTwoFactor, enableTwoFactor, getTwoFactorStatus,
  regenerateRecoveryCodes, startTwoFactorSetup,
} from "@/lib/api"

const errText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.")

/** The otpauth:// link as a QR code for the authenticator app to scan. */
function SetupQR({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ""
    new QRCodeStyling({
      width: 180, height: 180, type: "svg", data: value, margin: 8,
      dotsOptions: { color: "#000000", type: "square" },
      backgroundOptions: { color: "#ffffff" },
      qrOptions: { errorCorrectionLevel: "M" },
    }).append(ref.current)
  }, [value])
  return <div ref={ref} className="w-[180px] h-[180px] rounded-lg overflow-hidden bg-white" aria-label="Setup QR code" />
}

/** Shown once, right after they are made: copy or download, then done. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = `GenXQR recovery codes (each works once)\n\n${codes.join("\n")}\n`
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Save these recovery codes somewhere safe, like a password manager. If you lose your phone, each one signs you in once.
        <strong> They won't be shown again.</strong>
      </p>
      <div className="grid grid-cols-2 gap-2 max-w-sm rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 font-mono text-sm text-zinc-900 dark:text-white">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true) }}>
          <Copy size={13} /> {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => {
          const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
          const a = document.createElement("a")
          a.href = url
          a.download = "genxqr-recovery-codes.txt"
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}>
          <Download size={13} /> Download
        </Button>
        <Button type="button" size="sm" onClick={onDone}>I've saved them</Button>
      </div>
    </div>
  )
}

/**
 * Settings → Two-factor sign-in: an authenticator-app code after the password
 * (and after Google sign-in). Backend: services/two-factor.service.ts.
 */
export function TwoFactorSettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["two-factor"], queryFn: getTwoFactorStatus })
  const status = data?.data
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [mode, setMode] = useState<"idle" | "disable" | "regenerate">("idle")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const reset = () => { setCode(""); setPassword(""); setError(null) }
  const refresh = () => qc.invalidateQueries({ queryKey: ["two-factor"] })

  const start = useMutation({
    mutationFn: startTwoFactorSetup,
    onSuccess: (res) => { reset(); setSetup(res.data) },
    onError: (err) => setError(errText(err)),
  })
  const confirm = useMutation({
    mutationFn: () => enableTwoFactor(code),
    onSuccess: (res) => { setSetup(null); reset(); setCodes(res.data.recoveryCodes); void refresh() },
    onError: (err) => setError(errText(err)),
  })
  const turnOff = useMutation({
    mutationFn: () => disableTwoFactor(code, password || undefined),
    onSuccess: () => { setMode("idle"); reset(); void refresh() },
    onError: (err) => setError(errText(err)),
  })
  const regenerate = useMutation({
    mutationFn: () => regenerateRecoveryCodes(code),
    onSuccess: (res) => { setMode("idle"); reset(); setCodes(res.data.recoveryCodes); void refresh() },
    onError: (err) => setError(errText(err)),
  })

  const codeInput = (
    <div>
      <label htmlFor="tfa-code" className="label-text">Code from your authenticator app</label>
      <Input id="tfa-code" value={code} onChange={(e) => setCode(e.target.value.trim())} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={20} />
    </div>
  )
  const errorLine = error && (
    <p role="alert" className="text-red-500 text-xs flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" />{error}</p>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck size={16} className="text-violet-500" /> Two-factor sign-in
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !status ? (
          <Loader2 size={16} className="animate-spin text-zinc-400" />
        ) : codes ? (
          <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
        ) : setup ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); confirm.mutate() }}>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              1. Scan this with an authenticator app — Google Authenticator, Microsoft Authenticator, 1Password, Authy or similar.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              <SetupQR value={setup.otpauthUrl} />
              <div className="text-xs text-zinc-500 space-y-1 min-w-0">
                <p>Can't scan it? Enter this key in the app instead:</p>
                <p className="font-mono text-sm text-zinc-900 dark:text-white break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">2. Enter the 6-digit code the app shows.</p>
            <div className="max-w-xs">{codeInput}</div>
            {errorLine}
            <div className="flex gap-2">
              <Button type="submit" disabled={confirm.isPending || code.length < 6} className="gap-1.5">
                {confirm.isPending && <Loader2 size={14} className="animate-spin" />} Turn on
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setSetup(null); reset() }}>Cancel</Button>
            </div>
          </form>
        ) : !status.enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-xl">
              After your password (or Google), GenXQR will also ask for a code from an app on your phone, so a stolen password alone can't open your account.
              Single sign-on through your company skips this — your company's sign-in handles it.
            </p>
            {errorLine}
            <Button type="button" onClick={() => start.mutate()} disabled={start.isPending} className="gap-1.5">
              {start.isPending && <Loader2 size={14} className="animate-spin" />} Set up two-factor sign-in
            </Button>
          </div>
        ) : mode !== "idle" ? (
          <form className="space-y-4 max-w-sm" onSubmit={(e) => { e.preventDefault(); (mode === "disable" ? turnOff : regenerate).mutate() }}>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {mode === "disable" ? "To turn it off, confirm it's you." : "New codes replace the old ones, which stop working."} A recovery code works here too.
            </p>
            {codeInput}
            {mode === "disable" && status.hasPassword && (
              <div>
                <label htmlFor="tfa-password" className="label-text">Password</label>
                <Input id="tfa-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {errorLine}
            <div className="flex gap-2">
              <Button type="submit" variant={mode === "disable" ? "destructive" : "default"} disabled={turnOff.isPending || regenerate.isPending || code.length < 6} className="gap-1.5">
                {(turnOff.isPending || regenerate.isPending) && <Loader2 size={14} className="animate-spin" />}
                {mode === "disable" ? "Turn off" : "Make new codes"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setMode("idle"); reset() }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 size={15} /> On{status.enabledAt ? ` since ${new Date(status.enabledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? "" : "s"} left.
              {status.recoveryCodesLeft <= 3 && " Make new ones before you run out."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { reset(); setMode("regenerate") }}>New recovery codes</Button>
              <Button type="button" variant="outline" size="sm" className="text-red-500" onClick={() => { reset(); setMode("disable") }}>Turn off</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
