/**
 * Tells IndexNow search engines (Bing, Yandex, Seznam, Naver…) which public
 * pages changed in this deploy. Run by deploy.sh after the frontend build;
 * Google does not take part in IndexNow and still works from the sitemap.
 *
 * Only CHANGED pages are submitted, as the protocol asks
 * (https://www.indexnow.org/documentation): each prerendered page is hashed,
 * with the build-specific /assets/<hash> references stripped so a code-only
 * change does not count as new content, and compared with what the last
 * successful run submitted (.indexnow-state.json, gitignored, kept on the
 * server). Pages dropped from the sitemap are submitted once too, so engines
 * re-crawl them and see they are gone or noindex. The first run submits all.
 *
 * Never fails the deploy: any error is reported and the script exits 0, and
 * the state is only saved after the endpoint accepts the list, so a failed
 * run is retried by the next deploy.
 *
 * The key is public by design — it is the file public/<key>.txt, which the
 * engines fetch to confirm the submission came from this site.
 *
 * Submitting needs an explicit --submit, which only deploy.sh passes: a build
 * on a laptop has the production SITE_URL too, so the URL alone cannot tell a
 * deploy from a local test run.
 *
 *   node scripts/indexnow.mjs            # show what would be submitted
 *   node scripts/indexnow.mjs --submit   # submit (deploy.sh only)
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PUBLIC_ROUTES, SITE_URL } from "./public-routes.mjs"

const ENDPOINT = "https://api.indexnow.org/indexnow"
const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DIST = path.join(FRONTEND, "dist")
const STATE_FILE = path.join(FRONTEND, ".indexnow-state.json")
const dryRun = !process.argv.includes("--submit")

function main() {
  const key = fs
    .readdirSync(path.join(FRONTEND, "public"))
    .map((f) => f.match(/^([a-zA-Z0-9-]{8,128})\.txt$/)?.[1])
    .find((k) => k && fs.readFileSync(path.join(FRONTEND, "public", `${k}.txt`), "utf8").trim() === k)
  if (!key) return console.warn("indexnow — no key file in public/, skipping")

  const host = new URL(SITE_URL).host

  let previous = {}
  try {
    previous = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))
  } catch {
    // First run, or the file was removed: everything counts as changed.
  }

  const current = {}
  for (const route of PUBLIC_ROUTES.filter((r) => r.sitemap !== false)) {
    const file = route.path === "/" ? path.join(DIST, "index.html") : path.join(DIST, route.path, "index.html")
    if (!fs.existsSync(file)) return console.warn(`indexnow — ${file} missing (build not run?), skipping`)
    const html = fs.readFileSync(file, "utf8").replace(/\/assets\/[^"')\s]+/g, "")
    current[route.path] = crypto.createHash("sha256").update(html).digest("hex")
  }

  const changed = Object.keys(current).filter((p) => previous[p] !== current[p])
  const removed = Object.keys(previous).filter((p) => !(p in current))
  const urlList = [...changed, ...removed].map((p) => `${SITE_URL}${p === "/" ? "/" : p}`)
  if (urlList.length === 0) return console.log("indexnow — no public page changed; nothing to submit")

  if (dryRun) {
    console.log(`indexnow — dry run (no --submit), would submit ${urlList.length} URL(s):`)
    for (const u of urlList) console.log(`  ${u}`)
    return
  }

  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList }),
    signal: AbortSignal.timeout(15_000),
  }).then((res) => {
    // 200 = received, 202 = received with the key check still pending.
    if (res.status !== 200 && res.status !== 202) {
      console.warn(`indexnow — ${ENDPOINT} answered ${res.status}; will retry next deploy`)
      return
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(current, null, 2))
    console.log(`indexnow — submitted ${urlList.length} URL(s) (${res.status})`)
  })
}

try {
  await main()
} catch (err) {
  console.warn(`indexnow — failed, deploy unaffected: ${err instanceof Error ? err.message : err}`)
}
