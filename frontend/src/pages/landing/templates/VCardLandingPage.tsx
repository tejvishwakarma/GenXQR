import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

function buildVCard(c: Record<string, unknown>): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${c.fullName ?? ""}`,
    c.organization ? `ORG:${c.organization}` : null,
    c.title ? `TITLE:${c.title}` : null,
    c.email ? `EMAIL:${c.email}` : null,
    c.phone ? `TEL:${c.phone}` : null,
    c.website ? `URL:${c.website}` : null,
    c.address ? `ADR:;;${c.address};;;;` : null,
    "END:VCARD",
  ]
  return lines.filter(Boolean).join("\n")
}

export default function VCardLandingPage({ name, content }: Props) {
  const fullName = (content.fullName as string) || name
  const organization = content.organization as string | undefined
  const title = content.title as string | undefined
  const email = content.email as string | undefined
  const phone = content.phone as string | undefined
  const website = content.website as string | undefined
  const address = content.address as string | undefined
  const avatarUrl = content.avatarUrl as string | undefined
  const primaryColor = "#1a1a2e"
  const accent = "#e94560"

  const downloadVCard = () => {
    const vcard = buildVCard(content)
    const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${(content.fullName as string) || "contact"}.vcf`
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
            {phone && (
              <a href={`tel:${phone}`}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <span className="text-lg">📞</span>
                <div>
                  <p className="text-xs text-gray-400">Phone</p>
                  <p className="text-sm font-medium text-gray-800">{phone}</p>
                </div>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <span className="text-lg">✉️</span>
                <div>
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="text-sm font-medium text-gray-800">{email}</p>
                </div>
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <span className="text-lg">🌐</span>
                <div>
                  <p className="text-xs text-gray-400">Website</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{website}</p>
                </div>
              </a>
            )}
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

      <p className="mt-6 text-xs text-gray-400">Powered by GenXQR</p>
    </div>
  )
}
