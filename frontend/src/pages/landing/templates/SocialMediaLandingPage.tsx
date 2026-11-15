import type { PublicQRFile } from "@/lib/api"
import { SocialIcon } from "@/components/ui/social-icon"
import { socialLabel, socialLinksOf } from "@/lib/socialNetworks"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function SocialMediaLandingPage({ name, content }: Props) {
  const title = (content.name as string) || name
  const bio = content.bio as string | undefined
  const avatarUrl = content.avatarUrl as string | undefined
  const links = socialLinksOf(content.links)

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-sm">
        {/* Profile */}
        <div className="text-center mb-8">
          {avatarUrl ? (
            <img src={avatarUrl} alt={title}
              className="w-24 h-24 rounded-full object-cover mx-auto mb-3 ring-4 ring-white shadow-xl" />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto mb-3 bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-xl">
              {title.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {bio && <p className="text-gray-500 text-sm mt-1 max-w-xs mx-auto">{bio}</p>}
        </div>

        {/* Social links */}
        <div className="space-y-3">
          {links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 w-full py-4 px-5 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
            >
              <span className="flex-shrink-0"><SocialIcon platform={link.platform} size={40} /></span>
              <span className="font-semibold text-gray-800">{socialLabel(link.platform)}</span>
              <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          ))}
          {links.length === 0 && (
            <p className="text-center text-gray-400 py-8">No social links added</p>
          )}
        </div>

      </div>
    </div>
  )
}
