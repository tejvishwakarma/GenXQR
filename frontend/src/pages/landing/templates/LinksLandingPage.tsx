import type { PublicQRFile } from "@/lib/api"

interface LinkItem {
  label: string
  url: string
  icon?: string
}

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function LinksLandingPage({ name, content }: Props) {
  const title = (content.title as string) || name
  const bio = content.bio as string | undefined
  const avatarUrl = content.avatarUrl as string | undefined
  const links = (content.links as LinkItem[]) ?? []
  const primaryColor = (content.primaryColor as string) || "#4f46e5"

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-sm">
        {/* Profile */}
        <div className="text-center mb-8">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={title}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-3 ring-4 ring-white shadow-lg"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-2xl font-bold shadow-lg"
              style={{ background: primaryColor }}
            >
              {title.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {bio && <p className="text-gray-500 text-sm mt-1">{bio}</p>}
        </div>

        {/* Links */}
        <div className="space-y-3">
          {links.length > 0 ? (
            links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full py-4 px-5 bg-white rounded-2xl shadow-sm font-semibold text-gray-800 hover:shadow-md transition-shadow"
                style={{ borderLeft: `4px solid ${primaryColor}` }}
              >
                <span>{link.label}</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            ))
          ) : (
            <p className="text-center text-gray-400 py-8">No links added yet</p>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">Powered by GenXQR</p>
      </div>
    </div>
  )
}
