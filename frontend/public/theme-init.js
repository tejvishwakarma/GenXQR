/**
 * Sets the theme class and text direction BEFORE React mounts, so the page never
 * flashes the wrong theme on first paint.
 *
 * This lives as an external file (served from 'self'), NOT inline, on purpose:
 * it is the only script that stood between the site and a strict Content-Security
 * -Policy. With it external, script-src can drop 'unsafe-inline' entirely — a
 * stronger control than a nonce, because the page then allows no inline script
 * at all. It is a tiny, same-origin, cacheable file, and being a blocking
 * <script src> in <head> it still runs before first paint.
 *
 * Do NOT re-inline this, and do NOT re-add 'unsafe-inline' to script-src to make
 * an inline version work — that would undo the hardening this file exists for.
 */
(function () {
  try {
    // Theme — light is the default; only go dark if the user explicitly chose it.
    var stored = localStorage.getItem("theme")
    document.documentElement.classList.toggle("dark", stored === "dark")

    // RTL language direction
    var lang = localStorage.getItem("GenXQR_lang") || ""
    var rtlCodes = ["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi"]
    if (lang && rtlCodes.indexOf(lang) !== -1) {
      document.documentElement.dir = "rtl"
      document.documentElement.lang = lang
    } else if (lang) {
      document.documentElement.lang = lang
    }
  } catch (e) {
    // localStorage can throw in private mode / blocked-storage contexts. A theme
    // flash is a far smaller problem than a script error before the app loads.
  }
})()
