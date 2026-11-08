import { readableAccent } from "@/lib/utils"
import { CalendarDays, CalendarPlus, MapPin, Ticket, User } from "lucide-react"
import { eventCalendarUrl, type PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
  slug: string
  access?: string | null
}

const s = (v: unknown) => (typeof v === "string" ? v : "")

/**
 * "2026-11-20T19:00" is the event's own wall-clock time: shown as written,
 * with the zone's short name — the scanner may be anywhere.
 */
function formatWhen(local: string, timeZone: string, withDate = true): string {
  const d = new Date(`${local}:00Z`)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-IN", {
    timeZone: "UTC",
    ...(withDate && { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    hour: "numeric", minute: "2-digit",
  }) + (withDate ? "" : ` ${zoneLabel(timeZone, local)}`)
}

function zoneLabel(timeZone: string, local: string): string {
  try {
    const at = new Date(`${local}:00Z`)
    // en-IN names Asia/Kolkata "IST" (en-US says "GMT+5:30").
    return new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? timeZone
  } catch {
    return timeZone
  }
}

/** Google Calendar's "add event" link: wall-clock times plus ctz, so Google does the zone maths. */
function googleCalendarUrl(c: { title: string; start: string; end: string; timeZone: string; location: string; details: string }): string {
  const fmt = (local: string) => local.replace(/[-:]/g, "") + "00"
  const end = c.end || new Date(new Date(`${c.start}:00Z`).getTime() + 2 * 3_600_000).toISOString().slice(0, 16)
  const params = new URLSearchParams({
    action: "TEMPLATE", text: c.title, dates: `${fmt(c.start)}/${fmt(end)}`, ctz: c.timeZone,
    ...(c.details && { details: c.details }), ...(c.location && { location: c.location }),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** An EVENT code's scan page: when, where, add to calendar, tickets. */
export default function EventLandingPage({ name, content, design, slug, access }: Props) {
  const title = s(content.title) || name
  const start = s(content.start)
  const end = s(content.end)
  const timeZone = s(content.timeZone) || "Asia/Kolkata"
  const venue = s(content.venue)
  const address = s(content.address)
  const description = s(content.description)
  const organizer = s(content.organizer)
  const link = s(content.link)
  const accent = readableAccent(design)
  const location = [venue, address].filter(Boolean).join(", ")
  const sameDay = end && end.slice(0, 10) === start.slice(0, 10)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 pt-12 pb-10 text-white" style={{ background: `linear-gradient(145deg, ${accent}, ${accent}cc)` }}>
        <div className="max-w-md mx-auto">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/80">
            <CalendarDays size={14} /> Event
          </p>
          <h1 className="text-3xl font-bold mt-2 leading-tight">{title}</h1>
          {organizer && <p className="mt-2 text-white/80 text-sm inline-flex items-center gap-1.5"><User size={14} /> {organizer}</p>}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-6 pb-12 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
          <div className="p-5 flex gap-3">
            <CalendarDays size={20} className="shrink-0 mt-0.5" style={{ color: accent }} />
            <div>
              <p className="font-semibold text-gray-900">{formatWhen(start, timeZone)}</p>
              <p className="text-sm text-gray-500">
                {formatWhen(start, timeZone, false)}
                {end && ` – ${sameDay ? formatWhen(end, timeZone, false) : `${formatWhen(end, timeZone)} ${zoneLabel(timeZone, end)}`}`}
              </p>
            </div>
          </div>
          {location && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noopener noreferrer" className="p-5 flex gap-3 hover:bg-gray-50">
              <MapPin size={20} className="shrink-0 mt-0.5" style={{ color: accent }} />
              <div>
                {venue && <p className="font-semibold text-gray-900">{venue}</p>}
                {address && <p className="text-sm text-gray-500">{address}</p>}
                <p className="text-sm mt-1 font-medium" style={{ color: accent }}>Open in Maps</p>
              </div>
            </a>
          )}
        </div>

        {description && <div className="bg-white rounded-2xl shadow-sm p-5 text-gray-700 text-sm leading-relaxed whitespace-pre-line">{description}</div>}

        <div className="space-y-2.5">
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full rounded-xl text-white font-semibold py-3.5" style={{ background: accent }}>
              <Ticket size={18} /> Tickets &amp; registration
            </a>
          )}
          <a
            href={googleCalendarUrl({ title, start, end, timeZone, location, details: [description, link].filter(Boolean).join("\n\n") })}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-white border border-gray-200 text-gray-800 font-semibold py-3.5"
          >
            <CalendarPlus size={18} /> Add to Google Calendar
          </a>
          <a href={eventCalendarUrl(slug, access)} className="flex items-center justify-center gap-2 w-full rounded-xl bg-white border border-gray-200 text-gray-800 font-semibold py-3.5">
            <CalendarPlus size={18} /> Add to Apple / Outlook calendar
          </a>
        </div>
      </div>
    </div>
  )
}
