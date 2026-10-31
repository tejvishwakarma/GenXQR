import { describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"

/**
 * In production the app is only reached through nginx, which (with CloudPanel's
 * /etc/nginx/global_settings) owns these headers. If the app sent them too,
 * every API response would carry two copies — sometimes with conflicting values
 * (Helmet's X-XSS-Protection "0" next to CloudPanel's "1; mode=block", seen
 * live 31 Oct 2026). See the helmet() options in app.ts.
 */
const OWNED_BY_NGINX = [
  "content-security-policy",
  "x-frame-options",
  "referrer-policy",
  "strict-transport-security",
  "x-xss-protection",
]

describe("security headers the app leaves to nginx", () => {
  for (const path of ["/health", "/api/public/stats"]) {
    it(`should not send nginx-owned headers on ${path}`, async () => {
      const res = await request(app).get(path)
      for (const header of OWNED_BY_NGINX) {
        expect(res.headers[header], `${header} on ${path} would duplicate nginx's copy`).toBeUndefined()
      }
      // Single fixed value, kept for the dev server where there is no nginx.
      expect(res.headers["x-content-type-options"]).toBe("nosniff")
    })
  }
})
