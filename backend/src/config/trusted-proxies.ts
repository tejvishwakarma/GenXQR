/**
 * Proxies whose X-Forwarded-For entry Express may trust when working out the
 * visitor's IP (app.set("trust proxy", ...)).
 *
 * Production is  visitor → Cloudflare → nginx (same host) → Node. With
 * `trust proxy 1` Express trusted only nginx, so req.ip was the Cloudflare
 * edge that connected to nginx — unless nginx restored the real IP, which the
 * vhost in this repo does not do. Every visitor then looked like a handful of
 * Cloudflare addresses: per-IP rate limits (login, QR passwords) were shared
 * by everyone behind the same edge, scan geolocation and repeat-scan dedup
 * were wrong.
 *
 * Trusting loopback + Cloudflare's published ranges makes req.ip the first
 * address in the chain that is NOT one of them: the real visitor whether or
 * not nginx restores it, and — because only these ranges are trusted — a
 * forged X-Forwarded-For sent straight to the origin IP is ignored.
 *
 * Source: https://www.cloudflare.com/ips-v4 and /ips-v6 (fetched 23 Oct 2026).
 * Cloudflare changes these rarely; refresh from those URLs if they do.
 */
export const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
]

export const TRUSTED_PROXIES = ["loopback", ...CLOUDFLARE_RANGES]
