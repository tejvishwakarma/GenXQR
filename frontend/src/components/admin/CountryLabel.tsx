/** The backend's "looked up, no location" country code. */
export const UNKNOWN_COUNTRY = "ZZ"

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" })
  } catch {
    return null
  }
})()

/** Flag emoji for an ISO 3166-1 alpha-2 code; "" for unknown or invalid codes. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code) || code === UNKNOWN_COUNTRY) return ""
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/** English country name: the stored one, else the browser's, else the code itself. */
export function countryName(code: string | null | undefined, name?: string | null): string {
  if (!code) return "Not located yet"
  if (code === UNKNOWN_COUNTRY) return "Unknown"
  return name || regionNames?.of(code) || code
}

export function CountryLabel({ code, name }: { code: string | null | undefined; name?: string | null }) {
  const flag = countryFlag(code)
  const known = !!code && code !== UNKNOWN_COUNTRY
  return (
    <span className={known ? "text-zinc-200" : "text-zinc-500"}>
      {flag && <span className="mr-1.5" aria-hidden="true">{flag}</span>}
      {countryName(code, name)}
    </span>
  )
}
