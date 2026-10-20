import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

/**
 * Reads both content shapes that exist in the database:
 *   - the dashboard editor's (VCardEditor buildVCardContent): firstName, lastName,
 *     phones[], emails[], websites[], company, jobTitle, profileImage, address
 *     plus city/state/zip/country;
 *   - the flat shape the /v1 API documents: fullName, phone, email, website,
 *     organization, title, address, avatarUrl.
 * Previously only the flat shape was read, so every vCard made in the dashboard
 * showed its name and nothing else.
 */
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function entries(list: unknown, single: unknown): string[] {
  const fromList = Array.isArray(list)
    ? list.map((e) => str((e as { value?: unknown })?.value)).filter(Boolean)
    : []
  return fromList.length ? fromList : [str(single)].filter(Boolean)
}

/** Customer-supplied links render on a public page: http(s) only. */
function safeHttpUrl(raw: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null
  } catch {
    return null
  }
}

function normalize(c: Record<string, unknown>, fallbackName: string) {
  const joinedName = [str(c.firstName), str(c.lastName)].filter(Boolean).join(" ")
  return {
    fullName: str(c.fullName) || joinedName || fallbackName,
    organization: str(c.organization) || str(c.company),
    title: str(c.title) || str(c.jobTitle),
    phones: entries(c.phones, c.phone),
    emails: entries(c.emails, c.email),
    websites: entries(c.websites, c.website)
      .map(safeHttpUrl)
      .filter((u): u is string => u !== null),
    address: [str(c.address), str(c.city), str(c.state), str(c.zip), str(c.country)].filter(Boolean).join(", "),
    avatarUrl: str(c.avatarUrl) || str(c.profileImage),
  }
}

type VCardFields = ReturnType<typeof normalize>

/** RFC 6350 text escaping — a comma or newline in a field otherwise corrupts the file. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

function buildVCard(v: VCardFields): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(v.fullName)}`,
    v.organization ? `ORG:${esc(v.organization)}` : null,
    v.title ? `TITLE:${esc(v.title)}` : null,
    ...v.emails.map((e) => `EMAIL:${esc(e)}`),
    ...v.phones.map((p) => `TEL:${esc(p)}`),
    ...v.websites.map((w) => `URL:${esc(w)}`),
    v.address ? `ADR:;;${esc(v.address)};;;;` : null,
    "END:VCARD",
  ]
  return lines.filter(Boolean).join("\r\n")
}

export default function VCardLandingPage({ name, content }: Props) {
  const v = normalize(content, name)
  const { fullName, organization, title, phones, emails, websites, address, avatarUrl } = v
  const primaryColor = "#1a1a2e"
  const accent = "#e94560"

  const downloadVCard = () => {
    const vcard = buildVCard(v)
    const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${fullName.replace(/[^\w\s-]/g, "").trim() || "contact"}.vcf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4" style={{ background: "#f4f4f8" }}>
      <div className="w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl">

        {/* Banner */}
        <div className="h-28" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accent})` }} />

        {/* Avatar */}
        <div className="bg-white px-6 pb-6">
          <div className="-mt-12 mb-4 flex items-end gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName}
                className="w-24 h-24 rounded-2xl object-cover ring-4 ring-white shadow-lg" />
            ) : (
              <div className="w-24 h-24 rounded-2xl ring-4 ring-white shadow-lg flex items-center justify-center text-white text-3xl font-bold"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accent})` }}>
                {fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="pb-1">
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              {title && <p className="text-sm text-gray-500">{title}</p>}
              {organization && <p className="text-sm font-medium" style={{ color: accent }}>{organization}</p>}
            </div>
          </div>

          {/* Contact fields */}
          <div className="space-y-3">
            {phones.map((phone) => (
              <a key={`p-${phone}`} href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <span className="text-lg">📞</span>
                <div>
                  <p className="text-xs text-gray-400">Phone</p>
                  <p className="text-sm font-medium text-gray-800">{phone}</p>
                </div>
              </a>
            ))}
            {emails.map((email) => (
              <a key={`e-${email}`} href={`mailto:${email}`}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <span className="text-lg">✉️</span>
                <div>
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="text-sm font-medium text-gray-800">{email}</p>
                </div>
              </a>
            ))}
            {websites.map((website) => (
              <a key={`w-${website}`} href={website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <span className="text-lg">🌐</span>
                <div>
                  <p className="text-xs text-gray-400">Website</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{website}</p>
                </div>
              </a>
            ))}
            {address && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-lg">📍</span>
                <div>
                  <p className="text-xs text-gray-400">Address</p>
                  <p className="text-sm font-medium text-gray-800">{address}</p>
                </div>
              </div>
            )}
          </div>

          {/* Save contact button */}
          <button
            onClick={downloadVCard}
            className="mt-5 w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accent})` }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Save to Contacts
          </button>
        </div>
      </div>

    </div>
  )
}
