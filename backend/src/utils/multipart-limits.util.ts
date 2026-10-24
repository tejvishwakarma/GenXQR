import type { Options } from "multer"

/**
 * Text-field limits for EVERY multer instance (dependency advisories, 24 Oct 2026).
 *
 * multer turns bracketed field names into nested objects and arrays
 * (append-field). `a[4294967294]` makes an array of the maximum length, and a
 * following `a[b]` converts it to an object index by index: one tiny request
 * blocked the event loop for over 30 seconds, on the public CV upload too.
 * multer 2.5.0 can refuse such names, but only when these limits are SET.
 *
 * No form of ours sends a bracketed name (avatar, file and cv uploads, and the
 * flat careers fields), so nesting is refused outright. The extra keys are not
 * in @types/multer yet, hence a typed constant spread into each `limits`.
 */
export const MULTIPART_FIELD_LIMITS: NonNullable<Options["limits"]> & {
  fieldNestingDepth: number
  fieldArrayIndexLimit: number
} = {
  fieldNestingDepth: 0,
  fieldArrayIndexLimit: 0,
  // The careers form sends 7 text fields; nothing else sends more than a couple.
  fields: 20,
}
