import net from "node:net"

/**
 * A scanner's IP address with the part that identifies a household removed —
 * IPv4 to the /24 (203.0.113.x), IPv6 to the /48 (2001:db8:1::x). Enough for
 * "which network/area", not enough to point at a person.
 *
 * Scanner IPs are personal data (GDPR, India's DPDP Act) and went out in full
 * to every workspace member who could view analytics — Viewers included — in
 * the scan list and CSV (decided 24 Oct 2026). Full addresses stay in the
 * database for abuse handling and dedup; only what we SHOW is masked.
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return ""
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  const v = mapped ? mapped[1]! : ip
  if (net.isIPv4(v)) return v.split(".").slice(0, 3).join(".") + ".x"
  if (net.isIPv6(v)) {
    const head = v.split("::")[0]!.split(":").filter(Boolean).slice(0, 3)
    return `${head.join(":") || "0"}::x`
  }
  return "x"
}
