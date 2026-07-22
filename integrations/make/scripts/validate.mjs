#!/usr/bin/env node
// Validates every JSON / IML-JSON file in the Make app parses cleanly.
// Tolerates a leading UTF-8 BOM but reports genuine syntax errors and exits
// non-zero so `pnpm validate` can gate a push.
import { readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src")

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

let checked = 0
const errors = []
for (const file of walk(srcRoot)) {
  if (!/\.(json|imljson)$/.test(file)) continue
  checked++
  try {
    JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""))
  } catch (err) {
    errors.push(`${file}: ${err.message}`)
  }
}

if (errors.length > 0) {
  console.error(`✗ ${errors.length} invalid file(s):`)
  for (const message of errors) console.error("  - " + message)
  process.exit(1)
}
console.log(`✓ All ${checked} Make config files are valid JSON.`)
