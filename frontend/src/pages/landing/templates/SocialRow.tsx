import { SocialIcon } from "@/components/ui/social-icon"
import { socialLabel } from "@/lib/socialNetworks"

/** A row of social profile icons on a scan page (vCard, business). */
export default function SocialRow({ links, className = "" }: { links: { platform: string; url: string }[]; className?: string }) {
  if (links.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-2.5 ${className}`} aria-label="Social profiles">
      {links.map((l) => (
        <li key={`${l.platform}-${l.url}`}>
          <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={socialLabel(l.platform)} title={socialLabel(l.platform)}
            className="block rounded-xl transition-transform hover:-translate-y-0.5">
            <SocialIcon platform={l.platform} size={40} />
          </a>
        </li>
      ))}
    </ul>
  )
}
