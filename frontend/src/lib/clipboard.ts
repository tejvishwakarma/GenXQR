/**
 * Copies text, and says whether it worked. Call it straight from the tap
 * handler: iPhone Safari allows copying only while handling the tap.
 *
 * navigator.clipboard exists only on secure pages (HTTPS, localhost), and some
 * in-app browsers — the ones a QR scanner app or Instagram opens scan pages in —
 * refuse it. The fallback selects the text on the page and copies it with
 * execCommand, set up the way iPhone Safari needs.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText || !window.isSecureContext) return copyWithSelection(text)
  try {
    // Started synchronously, so it still counts as part of the tap.
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyWithSelection(text)
  }
}

function copyWithSelection(text: string): boolean {
  // A plain text node, selected with a range — Safari will not select a
  // hidden textarea's text this way, and select() alone selects nothing on iOS.
  const holder = document.createElement("span")
  holder.textContent = text
  holder.style.cssText = "position:fixed;top:0;left:0;white-space:pre;opacity:0;pointer-events:none;-webkit-user-select:text;user-select:text"
  document.body.appendChild(holder)
  const selection = window.getSelection()
  try {
    const range = document.createRange()
    range.selectNodeContents(holder)
    selection?.removeAllRanges()
    selection?.addRange(range)
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    selection?.removeAllRanges()
    document.body.removeChild(holder)
  }
}
