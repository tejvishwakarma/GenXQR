import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FeatureLocked, PlanChip } from "@/components/PlanFeatureGate"
import { ScanBrandHeader, ScanPageLogoBar } from "@/components/ScanBranding"
import {
  getBrandingSettings,
  updateBrandingSettings,
  uploadFile,
  ApiError,
  type ResolvedBranding,
} from "@/lib/api"

/**
 * White-label branding, in Settings.
 *
 * Controls whose name appears on the three pages a SCANNER sees — the landing
 * page, the password gate and the expired notice — for customers on a plan that
 * includes white-label.
 *
 * The one rule worth knowing before editing: these pages always name someone.
 * White-label swaps GenXQR's identity for the customer's; it never removes
 * identity altogether. An unattributed page that asks for a password is what
 * Google classified as deceptive on this domain earlier this year, so the server
 * falls back to GenXQR branding whenever a brand name is missing. The preview
 * below shows exactly that, rather than letting someone save a blank name and
 * discover the fallback on a printed QR code.
 */
const MAX_LOGO_BYTES = 2 * 1024 * 1024

export function BrandingSettings() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["branding"],
    queryFn: getBrandingSettings,
  })
  const saved = data?.data

  const [brandName, setBrandName] = useState("")
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [uploading, setUploading] = useState(false)
  const seeded = useRef(false)

  // Seed once from the server rather than on every render, so typing is not
  // overwritten by a background refetch.
  useEffect(() => {
    if (!saved || seeded.current) return
    seeded.current = true
    setBrandName(saved.brandName ?? "")
    setBrandLogoUrl(saved.brandLogoUrl)
  }, [saved])

  const save = useMutation({
    // The brand name is white-label (Business+); the logo is any paid plan. Only
    // send what this plan may change, so a Starter save is not refused for a
    // field it cannot edit.
    mutationFn: () =>
      updateBrandingSettings({
        ...(saved?.whiteLabelEnabled ? { brandName: brandName.trim() } : {}),
        brandLogoUrl: brandLogoUrl ?? "",
      }),
    onSuccess: (res) => {
      qc.setQueryData(["branding"], res)
      setError(null)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 4000)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Could not save your branding."),
  })

  async function handleLogo(file: File) {
    setError(null)
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2 MB or smaller.")
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadFile(file, "image")
      setBrandLogoUrl(uploaded.tempUrl)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload that image.")
    } finally {
      setUploading(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Branding</CardTitle></CardHeader>
        <CardContent><div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" /></CardContent>
      </Card>
    )
  }

  if (saved && !saved.scanPageLogoEnabled) {
    return (
      <FeatureLocked
        feature="scanPageLogo"
        title="Your logo on scan pages"
        description="Show your logo at the top of the page people see when they scan your QR codes."
      >
        {/* Anything already configured is kept, not deleted, on a downgrade — so
            say so rather than showing an empty state that implies it was lost. */}
        {(saved.brandName || saved.brandLogoUrl) && (
          <p className="mt-3 text-xs text-zinc-500">
            Your saved branding is still here and will apply again as soon as you
            are on a paid plan.
          </p>
        )}
      </FeatureLocked>
    )
  }

  const whiteLabel = saved?.whiteLabelEnabled ?? false
  // What a scanner will actually see on the password and expired pages, given
  // what is typed right now — including the fallback to GenXQR with no name.
  const preview: ResolvedBranding = whiteLabel && brandName.trim()
    ? { mode: "custom", name: brandName.trim(), logoUrl: brandLogoUrl, pageLogoUrl: brandLogoUrl }
    : { mode: "genxqr", name: null, logoUrl: null, pageLogoUrl: brandLogoUrl }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Branding on scan pages</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-5 text-sm text-zinc-500">
          Your logo appears at the top of the page people see when they scan your
          QR codes.{whiteLabel ? " With white-label, your brand name also replaces GenXQR's on that page, the password prompt and the expired notice." : ""}
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <span className="label-text">Logo</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  // Must match the `image` upload config in backend/src/routes/upload.routes.ts,
                  // which refuses SVG (it can carry script).
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleLogo(file)
                    e.target.value = ""
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {brandLogoUrl ? "Replace" : "Upload"}
                </Button>
                {brandLogoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setBrandLogoUrl(null)}
                  >
                    <X size={14} /> Remove
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                PNG, JPG, WebP or GIF, up to 2&nbsp;MB. Shown on a white bar at the
                top of the scan page{whiteLabel ? ", and on a dark background on the password and expired pages" : ""}.
              </p>
            </div>

            {whiteLabel ? (
              <div>
                <label htmlFor="brand-name" className="label-text">Brand name</label>
                <Input
                  id="brand-name"
                  name="brand-name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Your company name"
                  maxLength={60}
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Shown in place of GenXQR. Leave blank to keep GenXQR branding.
                  These pages always name someone — an unnamed page asking for a
                  password looks like phishing to browsers, so a blank name falls
                  back to us rather than to nothing.
                </p>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <PlanChip plan="Business" />
                Replace GenXQR&apos;s name with your own (white-label).
              </p>
            )}
          </div>

          {/* A live preview, because the pages this affects are ones the customer
              will rarely look at themselves — they are seen by people holding a
              phone in front of a printed code. */}
          <div className="space-y-3">
            <span className="label-text">Preview</span>
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              {preview.pageLogoUrl ? (
                <ScanPageLogoBar branding={preview} />
              ) : (
                <p className="bg-white px-4 py-4 text-center text-xs text-zinc-400">No logo yet — the scan page starts straight with your content.</p>
              )}
              <div className="h-16 bg-gradient-to-b from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900" aria-hidden="true" />
            </div>
            {whiteLabel && (
              <div className="rounded-xl bg-gradient-to-br from-gray-900 to-gray-800 p-6">
                <ScanBrandHeader branding={preview} />
                <p className="mt-4 text-center text-xs text-gray-400">
                  {preview.mode === "custom"
                    ? "Password and expired pages show your brand."
                    : "No brand name set — those pages show GenXQR."}
                </p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-1.5 text-xs text-red-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
        {savedFlash && (
          <p role="status" className="mt-4 flex items-start gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
            Branding saved. It applies to new scans immediately.
          </p>
        )}

        <div className="mt-5">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={save.isPending || uploading}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 size={14} className="animate-spin" />}
            Save branding
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
