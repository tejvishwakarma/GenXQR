import net from "node:net"

/**
 * The key a per-IP limit counts under.
 *
 * An IPv4 address is one visitor (or one shared network). An IPv6 address is
 * not: a single phone or server is handed a whole /64 — 18 quintillion
 * addresses — and can use a new one for every request. Counting each address
 * separately meant an IPv6 client had no limit at all (form answers, sign-in
 * attempts, counted scans). So IPv6 is counted per /64, the unit ISPs assign.
 */
export function ipRateKey(ip: string | undefined | null): string {
  if (!ip) return "unknown"
  const zoneless = ip.split("%")[0]!
  if (net.isIPv4(zoneless)) return zoneless
  if (!net.isIPv6(zoneless)) return zoneless
  // IPv4-mapped (::ffff:203.0.113.7) is that IPv4 address.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(zoneless)
  if (mapped) return mapped[1]!
  const [head = "", tail = ""] = zoneless.toLowerCase().split("::")
  const left = head ? head.split(":") : []
  const right = tail ? tail.split(":") : []
  const groups = zoneless.includes("::")
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left
  return `${groups.slice(0, 4).map((g) => (g.replace(/^0+/, "") || "0")).join(":")}::/64`
}
