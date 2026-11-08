/**
 * Calendar files for EVENT codes. The editor stores the event's wall-clock time
 * in its own time zone ("2026-11-20T19:00", Asia/Kolkata); calendar apps get it
 * in UTC, which every app reads the same way (a TZID would need a VTIMEZONE
 * block that Outlook insists on).
 */

/** The UTC instant of a wall-clock time in `timeZone`. */
export function zonedToUtc(local: string, timeZone: string): Date {
  const [d, t] = local.split("T") as [string, string]
  const [y, mo, da] = d.split("-").map(Number) as [number, number, number]
  const [h, mi] = t.split(":").map(Number) as [number, number]
  const asUtc = Date.UTC(y, mo - 1, da, h, mi)
  // The zone's offset at that moment; checked twice so a DST change between
  // the guess and the answer settles on the right side.
  const offset = (at: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(at))
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - at
  }
  let utc = asUtc - offset(asUtc)
  utc = asUtc - offset(utc)
  return new Date(utc)
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
/** RFC 5545 TEXT: backslash, semicolon, comma and newlines escaped. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
/** Lines longer than 75 octets continue on the next line after a space (RFC 5545 3.1). */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (Buffer.byteLength(rest) > 75) {
    let cut = 73
    while (Buffer.byteLength(rest.slice(0, cut)) > 73) cut--
    out.push(rest.slice(0, cut))
    rest = ` ${rest.slice(cut)}`
  }
  out.push(rest)
  return out.join("\r\n")
}

export interface EventContent {
  title: string
  start: string
  end?: string
  timeZone: string
  venue?: string
  address?: string
  description?: string
  link?: string
}

/** Start and end as instants; with no end, two hours. */
export function eventTimes(e: EventContent): { start: Date; end: Date } {
  const start = zonedToUtc(e.start, e.timeZone)
  const end = e.end ? zonedToUtc(e.end, e.timeZone) : new Date(start.getTime() + 2 * 3_600_000)
  return { start, end }
}

export function buildIcs(e: EventContent, uid: string, now = new Date()): string {
  const { start, end } = eventTimes(e)
  const location = [e.venue, e.address].filter(Boolean).join(", ")
  const description = [e.description, e.link].filter(Boolean).join("\n\n")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GenXQR//Event QR//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@genxqr.com`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(e.title)}`,
    ...(location ? [`LOCATION:${text(location)}`] : []),
    ...(description ? [`DESCRIPTION:${text(description)}`] : []),
    ...(e.link ? [`URL:${e.link.replace(/[\r\n]/g, "")}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(fold).join("\r\n") + "\r\n"
}
