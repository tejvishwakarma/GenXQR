/**
 * One CSV cell, safe to open in a spreadsheet.
 *
 * Quoting alone is not enough: Excel/Sheets evaluate a quoted cell that starts
 * with = + - @ (or a tab/CR) as a formula. Scan exports carry text the SCANNER
 * controls — Referer, and the browser/OS parsed from User-Agent — so a scan
 * with `Referer: =HYPERLINK(...)` ran in the owner's spreadsheet (security
 * audit, 23 Oct 2026). Such cells get a leading apostrophe, which spreadsheets
 * show as text.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}
