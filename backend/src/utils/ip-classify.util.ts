import net from "node:net"

/**
 * Whether an IP address is anything other than a normal public unicast address
 * — loopback, private, link-local, CGNAT, multicast, reserved, documentation,
 * benchmarking — in ANY spelling. Used to stop server-side requests (webhooks)
 * reaching internal services.
 *
 * The previous check handled IPv4-mapped IPv6 only in dotted form, but Node
 * writes `https://[::ffff:127.0.0.1]/` as hostname `[::ffff:7f00:1]`, so that
 * was treated as public (security audit, 23 Oct 2026). IPv6 is therefore
 * parsed into bytes, and every form that embeds an IPv4 address (mapped,
 * compatible, NAT64, 6to4) is judged by the embedded address.
 */
export function isNonPublicAddress(ip: string): boolean {
  const host = ip.replace(/^\[|\]$/g, "").split("%")[0]!.toLowerCase() // brackets, zone id
  if (net.isIPv4(host)) return isNonPublicIPv4(host.split(".").map(Number))
  if (net.isIPv6(host)) {
    const b = ipv6Bytes(host)
    return b === null ? true : isNonPublicIPv6(b)
  }
  return true // not an IP address at all: refuse rather than guess
}

function isNonPublicIPv4([a, b, c]: number[]): boolean {
  if (a === undefined || b === undefined || c === undefined) return true
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast 224/4, reserved 240/4, broadcast
  )
}

function isNonPublicIPv6(b: number[]): boolean {
  const zeroUpTo = (n: number) => b.slice(0, n).every((x) => x === 0)
  const v4 = (from: number) => isNonPublicIPv4(b.slice(from, from + 4))

  if (zeroUpTo(15) && (b[15] === 0 || b[15] === 1)) return true // :: and ::1
  if (zeroUpTo(10) && b[10] === 0xff && b[11] === 0xff) return v4(12) // ::ffff:a.b.c.d (mapped)
  if (zeroUpTo(12)) return v4(12) // ::a.b.c.d (IPv4-compatible, deprecated)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    // 64:ff9b::/96 well-known NAT64 → the embedded address; 64:ff9b:1::/48 local-use → refuse
    return b.slice(4, 12).every((x) => x === 0) ? v4(12) : true
  }
  if (b[0] === 0x20 && b[1] === 0x02) return v4(2) // 2002::/16 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true // Teredo 2001::/32
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true // documentation 2001:db8::/32
  if (b[0] === 0x01 && b[1] === 0x00 && zeroUpTo(8)) return true // discard-only 100::/64
  if ((b[0]! & 0xfe) === 0xfc) return true // unique local fc00::/7
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true // link-local fe80::/10
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0xc0) return true // site-local fec0::/10 (deprecated)
  if (b[0] === 0xff) return true // multicast
  return false
}

/** 16 bytes of an IPv6 address (already validated by net.isIPv6), or null. */
function ipv6Bytes(addr: string): number[] | null {
  let s = addr
  let tail: number[] = []
  const lastColon = s.lastIndexOf(":")
  const maybeV4 = s.slice(lastColon + 1)
  if (net.isIPv4(maybeV4)) {
    tail = maybeV4.split(".").map(Number)
    const [a, b, c, d] = tail as [number, number, number, number]
    s = `${s.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = s.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest]
  const bytes: number[] = []
  for (const g of groups) {
    const v = parseInt(g, 16)
    if (!Number.isFinite(v) || v < 0 || v > 0xffff) return null
    bytes.push(v >> 8, v & 0xff)
  }
  return bytes.length === 16 ? bytes : null
}
