import fs from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { UPLOAD_BASE } from "../../src/routes/upload.routes.js"

/**
 * Static exposure of the uploads tree.
 *
 * backend/uploads/ holds two very different classes of file:
 *   - customer QR assets (image, pdf, mp3, video) and avatars, which are meant
 *     to be publicly fetchable so QR codes and <img> tags resolve
 *   - cvs/, which are job applicants' résumés — personal data that must ONLY
 *     be reachable via the authenticated admin route
 *
 * They share one directory, so a single `express.static(UPLOAD_BASE)` (or an
 * nginx alias at the uploads root) publishes the CVs alongside everything else.
 * These tests pin that boundary.
 */

const CV_DIR = path.join(UPLOAD_BASE, "cvs")
const IMAGE_DIR = path.join(UPLOAD_BASE, "image")
const CV_FIXTURE = path.join(CV_DIR, "__test_secret_cv.pdf")
const IMAGE_FIXTURE = path.join(IMAGE_DIR, "__test_public_image.png")

// Minimal valid PNG (1x1) so the static handler has something real to serve.
const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
)

describe("uploads static exposure", () => {
  beforeAll(() => {
    fs.mkdirSync(CV_DIR, { recursive: true })
    fs.mkdirSync(IMAGE_DIR, { recursive: true })
    fs.writeFileSync(CV_FIXTURE, "SENSITIVE APPLICANT CV CONTENTS")
    fs.writeFileSync(IMAGE_FIXTURE, PNG_1PX)
  })

  afterAll(() => {
    fs.rmSync(CV_FIXTURE, { force: true })
    fs.rmSync(IMAGE_FIXTURE, { force: true })
  })

  describe("applicant CVs must never be publicly served", () => {
    it("should not serve a CV from /uploads/cvs/", async () => {
      const res = await request(app).get("/uploads/cvs/__test_secret_cv.pdf")

      expect(res.status).toBe(404)
      expect(res.text).not.toContain("SENSITIVE APPLICANT CV CONTENTS")
    })

    it("should not serve a CV via a traversal-style path either", async () => {
      // Express normalises this, but assert the outcome rather than trusting it.
      const res = await request(app).get("/uploads/image/../cvs/__test_secret_cv.pdf")

      expect(res.status).not.toBe(200)
      expect(res.text).not.toContain("SENSITIVE APPLICANT CV CONTENTS")
    })

    it("should not leak CV contents through a directory listing", async () => {
      const res = await request(app).get("/uploads/cvs/")

      expect(res.status).toBe(404)
      expect(res.text).not.toContain("__test_secret_cv")
    })
  })

  describe("customer QR assets stay publicly fetchable", () => {
    it("should serve an uploaded image, so QR codes and logos resolve", async () => {
      const res = await request(app).get("/uploads/image/__test_public_image.png")

      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toContain("image/png")
    })

    it("should send nosniff on public uploads", async () => {
      const res = await request(app).get("/uploads/image/__test_public_image.png")

      expect(res.headers["x-content-type-options"]).toBe("nosniff")
    })
  })
})
