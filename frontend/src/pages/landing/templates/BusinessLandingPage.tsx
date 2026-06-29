import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function BusinessLandingPage({ name, content, files }: Props) {
  const businessName = (content.businessName as string) || name
  const category = content.category as string | undefined
  const description = content.description as string | undefined
  const phone = content.phone as string | undefined
  const email = content.email as string | undefined
  const website = content.website as string | undefined
  const address = content.address as string | undefined
  const hours = content.hours as Record<string, string> | undefined
  const logoFile = files.find((f) => f.fileType === "IMAGE")
  const accent = "#4f46e5"

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="h-24" style={{ background: `linear-gradient(135deg, ${accent}, #7c3aed)` }} />
          <div className="px-6 pb-6">
            <div className="-mt-10 flex items-end gap-4 mb-4">
              {logoFile ? (
                <img src={logoFile.fileUrl} alt={businessName}
                  className="w-20 h-20 rounded-2xl object-cover ring-4 ring-white shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-2xl ring-4 ring-white shadow-lg flex items-center justify-center text-white text-3xl font-bold flex-shrink-0"
                  style={{ background: accent }}>
                  {businessName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{businessName}</h1>
            {category && <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">{category}</span>}
            {description && <p className="text-gray-500 text-sm mt-3 leading-relaxed">{description}</p>}
          </div>
        </div>

        {/* Contact */}
        {(phone || email || website || address) && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Contact</h2>
            {phone && (
              <a href={`tel:${phone}`} className="flex items-center gap-3 hover:text-indigo-600 transition-colors">
                <span className="text-lg">📞</span>
                <span className="text-sm text-gray-700">{phone}</span>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-3 hover:text-indigo-600 transition-colors">
                <span className="text-lg">✉️</span>
                <span className="text-sm text-gray-700">{email}</span>
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 hover:text-indigo-600 transition-colors">
                <span className="text-lg">🌐</span>
                <span className="text-sm text-gray-700 truncate">{website}</span>
              </a>
            )}
            {address && (
              <div className="flex items-start gap-3">
                <span className="text-lg">📍</span>
                <span className="text-sm text-gray-700">{address}</span>
              </div>
            )}
          </div>
        )}

        {/* Hours */}
        {hours && Object.keys(hours).length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Business Hours</h2>
            <div className="space-y-2">
              {DAYS.map((day) => {
                const h = hours[day.toLowerCase()] ?? hours[day]
                return (
                  <div key={day} className="flex justify-between text-sm">
                    <span className="text-gray-600">{day}</span>
                    <span className={`font-medium ${h ? "text-gray-900" : "text-gray-400"}`}>
                      {h ?? "Closed"}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">Powered by GenXQR</p>
      </div>
    </div>
  )
}
