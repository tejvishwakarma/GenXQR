import { fileTypeFromFile } from "file-type"
import { logger } from "../logger/index.js"

// Extension/MIME-header checks (already enforced by multer's fileFilter at
// each call site) only look at client-supplied, attacker-controlled data.
// This reads the actual file content on disk and checks it against its
// magic bytes/binary signature, so a script renamed to "photo.jpg" gets
// caught even though its extension and Content-Type header both lie.

export interface MagicByteRule {
  /**
   * Exact set of acceptable detected MIME types. Use this over `category`
   * when the valid set is small and known (e.g. a handful of document
   * formats) rather than "any subtype of X". Checked before `category` if
   * both are set.
   */
  allowedMimes?: string[]
  /** MIME category the detected type must fall in. A trailing "/" matches any subtype (e.g. "image/" matches "image/png"); without one, an exact match is required (e.g. "application/pdf"). */
  category?: string
  /**
   * Allow the file through, with a warning logged, if magic-byte detection
   * finds no signature at all — for formats without a universally reliable
   * one (e.g. raw AAC/ADTS audio, legacy MS Office binary/CFB containers).
   * Defaults to false: no detected signature means reject.
   */
  allowUndetected?: boolean
}

export async function verifyMagicBytes(
  filePath: string,
  rule: MagicByteRule,
  logContext: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const detected = await fileTypeFromFile(filePath).catch(() => undefined)

  if (!detected) {
    if (rule.allowUndetected) {
      logger.warn(
        "Magic-byte detection found no signature — allowing based on extension/MIME checks alone",
        logContext,
      )
      return { ok: true }
    }
    return {
      ok: false,
      error: "Could not verify the file's actual content — it does not appear to be a valid file of this type",
    }
  }

  const matches = rule.allowedMimes
    ? rule.allowedMimes.includes(detected.mime)
    : rule.category
      ? rule.category.endsWith("/")
        ? detected.mime.startsWith(rule.category)
        : detected.mime === rule.category
      : false

  if (!matches) {
    return { ok: false, error: `File content does not match the expected type (detected: ${detected.mime})` }
  }

  return { ok: true }
}
