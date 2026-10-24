import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Image as ImageIcon, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PlanChip } from "@/components/PlanFeatureGate"
import { useWorkspace } from "@/hooks/useWorkspace"
import {
  getBrandingSettings,
  getPublicBranding,
  updateBrandingSettings,
  uploadFile,
  ApiError,
} from "@/lib/api"

/**
 * "Logo on scan page" in the QR designer (decided 24 Oct 2026).
 *
 * There is ONE scan-page logo per account (User.brandLogoUrl, Settings →
 * Branding on scan pages), shown at the top of every code's scan page on any
 * paid plan. This edits that same setting from where people design a code —
 * so a change here applies to all their codes, and the copy says so.
 *
 * In someone else's workspace the scan page shows the OWNER's logo, and
 * /api/branding is personal-only, so the member's own setting is neither shown
 * nor offered there.
 */

const MAX_LOGO_BYTES = 2 * 1024 * 1024
/** Must match the `image` upload config in backend/src/routes/upload.routes.ts (no SVG). */
const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif"

/** The logo the scan-page preview should show, or null — what a scanner would see. */
export function useScanPageLogoPreview(slug: string | undefined): string | null {
  const { isPersonal } = useWorkspace()
  const own = useQuery({ queryKey: ["branding"], queryFn: getBrandingSettings, enabled: isPersonal })
  // Editing a workspace code: ask the public endpoint, which resolves the owner's.
  const owner = useQuery({
    queryKey: ["public-branding", slug],
    queryFn: () => getPublicBranding(slug!),
    enabled: !isPersonal && !!slug,
  })
  if (isPersonal) {
    const settings = own.data?.data
    return settings?.scanPageLogoEnabled ? settings.brandLogoUrl : null
  }
  return owner.data?.pageLogoUrl ?? null
}

export function ScanPageLogoSetting() {
  const { isPersonal } = useWorkspace()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ["branding"], queryFn: getBrandingSettings, enabled: isPersonal })
  const settings = data?.data

  const save = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return updateBrandingSettings({ brandLogoUrl: "" })
      const uploaded = await uploadFile(file, "image")
      return updateBrandingSettings({ brandLogoUrl: uploaded.tempUrl })
    },
    onSuccess: (res) => {
      qc.setQueryData(["branding"], res)
      setError(null)
      setConfirmRemove(false)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Could not update your scan page logo."),
  })

  function pick(file: File) {
    setError(null)
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2 MB or smaller.")
      return
    }
    save.mutate(file)
  }

  const heading = (
    <h3 className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-1 flex items-center gap-2">
      <ImageIcon size={14} className="text-sky-400" /> Logo on scan page
    </h3>
  )

  if (!isPersonal) {
    return (
      <div>
        {heading}
        <p className="text-zinc-600 text-[11px]">
          Codes in this workspace show the workspace owner&apos;s logo at the top of the scan page, set in their Settings.
        </p>
      </div>
    )
  }

  if (isLoading || !settings) {
    return (
      <div>
        {heading}
        <div className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
      </div>
    )
  }

  if (!settings.scanPageLogoEnabled) {
    return (
      <div>
        {heading}
        <p className="text-zinc-600 text-[11px] flex flex-wrap items-center gap-1.5">
          <PlanChip plan="Starter" />
          Show your logo at the top of the page people see after scanning.
          <Link to="/app/billing" className="text-violet-500 hover:text-violet-400 font-medium">Upgrade</Link>
        </p>
      </div>
    )
  }

  const logo = settings.brandLogoUrl
  return (
    <div>
      {heading}
      <p className="text-zinc-600 text-[11px] mb-3">
        Shown on a white bar at the top of the scan page — for all your QR codes, not just this one.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) pick(file)
          e.target.value = ""
        }}
      />
      <div className="flex items-center gap-3 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-300 dark:border-zinc-700">
        {logo ? (
          // On white, as it appears on the scan page.
          <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-white px-1.5">
            <img src={logo} alt="Scan page logo" className="max-h-9 max-w-full object-contain" />
          </div>
        ) : (
          <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-400">
            <ImageIcon size={16} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-700 dark:text-zinc-300">Remove from all your scan pages?</span>
              <Button type="button" size="sm" variant="destructive" disabled={save.isPending} onClick={() => save.mutate(null)}>
                {save.isPending && <Loader2 size={13} className="animate-spin" />} Remove
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={save.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {save.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {logo ? "Replace" : "Upload logo"}
              </Button>
              {logo && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  Remove
                </button>
              )}
            </div>
          )}
          <p className="text-zinc-500 text-[10px] mt-1">
            PNG, JPG, WebP or GIF, up to 2&nbsp;MB · also in{" "}
            <Link to="/app/settings" className="underline underline-offset-2 hover:text-zinc-400">Settings</Link>
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-500">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
