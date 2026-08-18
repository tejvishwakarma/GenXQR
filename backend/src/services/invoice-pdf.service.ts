/**
 * Invoice PDF generation.
 *
 * Draws the invoice directly with pdfkit rather than rendering HTML in a
 * headless browser. The browser approach worked locally and failed in
 * production for reasons that had nothing to do with this code: the server is
 * ARM64, Chrome for Testing publishes no Linux ARM64 build, and the distro's
 * only Chromium is a snap that refuses to launch from a PM2-spawned process
 * ("not a snap cgroup"). Every fix for that meant adding an untrusted APT source
 * to a host that processes payments.
 *
 * pdfkit is pure JavaScript: no browser binary, no system libraries, no
 * architecture assumptions, and generation drops from seconds to milliseconds.
 *
 * ── On currency symbols ──────────────────────────────────────────────────────
 * Amounts are written as "INR 799.00", never "₹799.00".
 *
 * This is deliberate and load-bearing. The built-in PDF fonts use WinAnsi
 * encoding, which has no rupee sign (U+20B9). pdfkit does not error on it — it
 * splits the code point and emits bytes 0x20 0xB9, so "₹799" renders as
 * " ¹799": a space and a superscript one. Verified by inspecting the content
 * stream, which showed <4120b942> for the string "A₹B".
 *
 * Printing "₹" correctly would mean embedding a TrueType font carrying the
 * glyph. That is a ~300KB binary asset plus font licensing, to gain a symbol —
 * whereas "INR" is the ISO 4217 code, unambiguous on an invoice, and cannot
 * silently corrupt. If the symbol is ever wanted, embed a font and change
 * formatAmount(); do not simply swap the character back in.
 */

import PDFDocument from "pdfkit"
import type { PlanName } from "@prisma/client"

export interface InvoiceData {
  invoiceNumber: string
  createdAt: Date
  periodStart: Date
  periodEnd: Date
  /**
   * What was actually charged, in paise. With a coupon this is the DISCOUNTED
   * figure, which is why `discount` below is needed to show an honest breakdown —
   * otherwise a ₹799 plan bought with a 99% code reads as a ₹799 plan that costs
   * ₹7.99, with no explanation of where the difference went.
   */
  amount: number
  /**
   * Present only when a coupon was applied. originalPaise is the plan's list
   * price; discountPaise is what came off. Sourced from CouponRedemption, which
   * records all three figures at the moment of payment.
   */
  discount?: {
    code: string
    originalPaise: number
    discountPaise: number
  } | null
  currency: string
  status: string
  planName: PlanName
  billingCycle: string
  cashfreeOrderId: string | null
  cashfreePaymentId: string | null
  customer: { name: string; email: string }
  /** Public site URL, shown under the brand. */
  siteUrl: string
  supportEmail: string
  /** Registered legal entity the payment was made to. */
  legalName: string
}

// ─── Layout constants (PDF points; A4 is 595.28 x 841.89) ─────────────────────
const PAGE_MARGIN = 50
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2

const COLOR = {
  ink: "#111827",
  body: "#374151",
  muted: "#6b7280",
  faint: "#9ca3af",
  line: "#e5e7eb",
  panel: "#f9fafb",
  brand: "#7c3aed",
  paidBg: "#d1fae5",
  paidText: "#065f46",
} as const

/** Rupees from paise, grouped Indian-style, prefixed with the ISO code. */
function formatAmount(minorUnits: number, currency: string): string {
  const major = minorUnits / 100
  return `${currency} ${major.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
}

/**
 * Renders the invoice and resolves with the finished PDF bytes.
 *
 * pdfkit is a stream, so the buffer is assembled here rather than piped to the
 * response directly — the route needs a known Content-Length, and a mid-render
 * failure must not leave a half-written PDF already flushed to the client.
 */
export function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN })
    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      drawInvoice(doc, data)
      doc.end()
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

function drawInvoice(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  const left = PAGE_MARGIN
  const right = PAGE_MARGIN + CONTENT_WIDTH

  // ── Header: brand on the left, invoice identity on the right ──────────────
  const headerTop = PAGE_MARGIN

  doc.roundedRect(left, headerTop, 34, 34, 8).fill(COLOR.brand)
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(19).text("G", left, headerTop + 8, {
    width: 34,
    align: "center",
  })

  doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(17).text("GenXQR", left + 44, headerTop + 3)
  doc.fillColor(COLOR.muted).font("Helvetica").fontSize(9).text(data.siteUrl, left + 44, headerTop + 22)

  doc.fillColor(COLOR.ink).font("Helvetica").fontSize(22).text("INVOICE", left, headerTop, {
    width: CONTENT_WIDTH,
    align: "right",
  })
  doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(10).text(`# ${data.invoiceNumber}`, left, headerTop + 27, {
    width: CONTENT_WIDTH,
    align: "right",
  })

  // ── Billed From / Billed To ───────────────────────────────────────────────
  const addrTop = headerTop + 62
  const addrHeight = 76
  doc.roundedRect(left, addrTop, CONTENT_WIDTH, addrHeight, 8).fill(COLOR.panel)

  const colWidth = CONTENT_WIDTH / 2 - 24
  const textTop = addrTop + 14

  doc.fillColor(COLOR.faint).font("Helvetica-Bold").fontSize(7.5).text("BILLED FROM", left + 16, textTop, {
    characterSpacing: 1.2,
  })
  doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(11).text(data.legalName, left + 16, textTop + 14)
  doc
    .fillColor(COLOR.body)
    .font("Helvetica")
    .fontSize(9)
    .text(`Trading as GenXQR\nIndia\n${data.supportEmail}`, left + 16, textTop + 28, { width: colWidth })

  const rightCol = left + CONTENT_WIDTH / 2 + 8
  doc.fillColor(COLOR.faint).font("Helvetica-Bold").fontSize(7.5).text("BILLED TO", rightCol, textTop, {
    characterSpacing: 1.2,
  })
  doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(11).text(data.customer.name, rightCol, textTop + 14, {
    width: colWidth,
    ellipsis: true,
  })
  doc
    .fillColor(COLOR.body)
    .font("Helvetica")
    .fontSize(9)
    .text(data.customer.email, rightCol, textTop + 28, { width: colWidth, ellipsis: true })

  // ── Issue date and payment status ─────────────────────────────────────────
  const metaTop = addrTop + addrHeight + 20

  doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7.5).text("DATE ISSUED", left, metaTop, {
    characterSpacing: 1,
  })
  doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(10).text(formatDate(data.createdAt), left, metaTop + 12)

  const statusLabel = data.status.toUpperCase()
  const badgeWidth = Math.max(46, doc.widthOfString(statusLabel) + 20)
  doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7.5).text("PAYMENT STATUS", left, metaTop, {
    width: CONTENT_WIDTH,
    align: "right",
    characterSpacing: 1,
  })
  doc.roundedRect(right - badgeWidth, metaTop + 11, badgeWidth, 16, 8).fill(COLOR.paidBg)
  doc
    .fillColor(COLOR.paidText)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(statusLabel, right - badgeWidth, metaTop + 15.5, { width: badgeWidth, align: "center" })

  // ── Line-item table ───────────────────────────────────────────────────────
  const tableTop = metaTop + 44
  const rowHeight = 52
  const headerHeight = 24

  const colDescX = left + 14
  const colPeriodX = left + CONTENT_WIDTH * 0.52
  const colAmountRight = right - 14

  doc.rect(left, tableTop, CONTENT_WIDTH, headerHeight).fill(COLOR.panel)
  doc.fillColor(COLOR.body).font("Helvetica-Bold").fontSize(7.5)
  doc.text("DESCRIPTION", colDescX, tableTop + 8, { characterSpacing: 1 })
  doc.text("PERIOD", colPeriodX, tableTop + 8, { characterSpacing: 1 })
  doc.text("AMOUNT", left, tableTop + 8, { width: CONTENT_WIDTH - 14, align: "right", characterSpacing: 1 })

  const rowTop = tableTop + headerHeight
  doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(11).text(`GenXQR ${data.planName} Plan`, colDescX, rowTop + 12)
  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(8.5)
    .text(`Subscription — ${data.planName} tier (${data.billingCycle})`, colDescX, rowTop + 27, {
      width: CONTENT_WIDTH * 0.48,
    })
  doc
    .fillColor(COLOR.body)
    .font("Helvetica")
    .fontSize(8.5)
    .text(`${formatDate(data.periodStart)}\nto ${formatDate(data.periodEnd)}`, colPeriodX, rowTop + 13, {
      width: CONTENT_WIDTH * 0.24,
    })
  // The line item is the plan at LIST price; the discount is applied in the
  // totals below, the way a receipt is normally read.
  const lineItemPaise = data.discount ? data.discount.originalPaise : data.amount
  doc
    .fillColor(COLOR.ink)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(formatAmount(lineItemPaise, data.currency), left, rowTop + 14, {
      width: colAmountRight - left,
      align: "right",
    })

  // Table outline drawn last so it sits above the header fill.
  doc.roundedRect(left, tableTop, CONTENT_WIDTH, headerHeight + rowHeight, 6).lineWidth(0.8).stroke(COLOR.line)
  doc
    .moveTo(left, tableTop + headerHeight)
    .lineTo(right, tableTop + headerHeight)
    .lineWidth(0.8)
    .stroke(COLOR.line)

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalsTop = tableTop + headerHeight + rowHeight + 18
  const totalsWidth = 220
  const totalsLeft = right - totalsWidth
  // One extra row when a coupon was used, so the box grows rather than overlapping
  // the payment-details grid beneath it.
  const totalsHeight = data.discount ? 92 : 74
  const formatted = formatAmount(data.amount, data.currency)

  doc.roundedRect(totalsLeft, totalsTop, totalsWidth, totalsHeight, 8).fill(COLOR.panel)

  const totalsRow = (label: string, value: string, y: number, bold = false) => {
    doc
      .fillColor(bold ? COLOR.ink : COLOR.body)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 11 : 9.5)
    doc.text(label, totalsLeft + 14, y)
    doc.text(value, totalsLeft, y, { width: totalsWidth - 14, align: "right" })
  }

  totalsRow("Subtotal", formatAmount(lineItemPaise, data.currency), totalsTop + 12)

  let rowY = totalsTop + 30
  if (data.discount) {
    // Naming the code matters: without it the customer cannot tell a discount
    // from a pricing error, and support cannot either.
    totalsRow(
      `Discount (${data.discount.code})`,
      `-${formatAmount(data.discount.discountPaise, data.currency)}`,
      rowY,
    )
    rowY += 18
  }
  totalsRow("Tax (GST)", "Included", rowY)
  rowY += 18

  doc
    .moveTo(totalsLeft + 14, rowY)
    .lineTo(totalsLeft + totalsWidth - 14, rowY)
    .dash(2, { space: 2 })
    .lineWidth(0.8)
    .stroke("#d1d5db")
  doc.undash()
  totalsRow("Total Paid", formatted, rowY + 7, true)

  // ── Payment reference ─────────────────────────────────────────────────────
  let cursor = totalsTop + totalsHeight + 24

  if (data.cashfreeOrderId || data.cashfreePaymentId) {
    doc.moveTo(left, cursor).lineTo(right, cursor).lineWidth(0.8).stroke(COLOR.line)
    cursor += 14

    doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(10).text("Payment Details", left, cursor)
    cursor += 18

    const cells: Array<[string, string]> = []
    if (data.cashfreeOrderId) cells.push(["ORDER ID", data.cashfreeOrderId])
    if (data.cashfreePaymentId) cells.push(["CASHFREE REF", data.cashfreePaymentId])
    cells.push(["METHOD", "Cashfree Payments"])
    cells.push(["CURRENCY", data.currency])

    const cellWidth = CONTENT_WIDTH / 2 - 6
    const cellHeight = 34

    cells.forEach(([label, value], index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const x = left + col * (cellWidth + 12)
      const y = cursor + row * (cellHeight + 8)

      doc.roundedRect(x, y, cellWidth, cellHeight, 6).fill(COLOR.panel)
      doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(6.5).text(label, x + 10, y + 7, {
        characterSpacing: 1,
      })
      // Identifiers can be long; ellipsis keeps them on one line rather than
      // overflowing the cell and colliding with the row beneath.
      doc.fillColor(COLOR.ink).font("Courier").fontSize(8.5).text(value, x + 10, y + 18, {
        width: cellWidth - 20,
        ellipsis: true,
        lineBreak: false,
      })
    })

    cursor += Math.ceil(cells.length / 2) * (cellHeight + 8) + 10
  }

  // ── Footer, pinned to the bottom of the page ──────────────────────────────
  const footerTop = 841.89 - PAGE_MARGIN - 52
  doc.moveTo(left, footerTop).lineTo(right, footerTop).lineWidth(0.8).stroke(COLOR.line)

  doc
    .fillColor(COLOR.body)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Thank you for your business!", left, footerTop + 12, { width: CONTENT_WIDTH, align: "center" })
  doc
    .fillColor(COLOR.faint)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `This is a computer-generated invoice and does not require a signature.\nQuestions? Contact ${data.supportEmail}`,
      left,
      footerTop + 26,
      { width: CONTENT_WIDTH, align: "center" },
    )
}
