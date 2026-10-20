import { useState, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import {
  Copy, Check, Key, ChevronRight, Menu, X,
  BookOpen, Shield, Zap, AlertTriangle, Radio,
  List, Plus, Eye, Pencil, Trash2, BarChart2, Power, ScanLine,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SEOMeta } from "@/components/SEOMeta"

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "curl" | "node" | "python"

interface Field {
  name: string
  type: string
  required?: boolean
  desc: string
}

interface Endpoint {
  id: string
  method: "GET" | "POST" | "PATCH" | "DELETE"
  path: string
  summary: string
  description: string
  queryParams?: Field[]
  bodyParams?: Field[]
  responseFields: Field[]
  codes: { code: string; desc: string }[]
  examples: Record<Lang, string>
  responseExample: string
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const METHOD_COLOR: Record<string, string> = {
  GET:    "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  POST:   "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30",
  PATCH:  "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
  DELETE: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30",
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV = [
  {
    group: "Getting Started",
    icon: <BookOpen size={13} />,
    items: [
      { id: "introduction",   label: "Introduction" },
      { id: "authentication", label: "Authentication" },
      { id: "rate-limits",    label: "Rate Limits" },
      { id: "errors",         label: "Error Codes" },
      { id: "pagination",     label: "Pagination" },
    ],
  },
  {
    group: "QR Codes",
    icon: <Key size={13} />,
    items: [
      { id: "ep-list",   label: "List QR Codes" },
      { id: "ep-create", label: "Create QR Code" },
      { id: "ep-get",    label: "Get QR Code" },
      { id: "ep-update", label: "Update QR Code" },
      { id: "ep-toggle", label: "Toggle QR Code" },
      { id: "ep-delete", label: "Delete QR Code" },
    ],
  },
  {
    group: "Analytics",
    icon: <BarChart2 size={13} />,
    items: [
      { id: "ep-analytics", label: "QR Analytics" },
      { id: "ep-scans",     label: "List Scans" },
    ],
  },
  {
    group: "Webhooks",
    icon: <Radio size={13} />,
    items: [
      { id: "webhooks-overview", label: "Overview" },
      { id: "webhooks-events",   label: "Events & Payloads" },
      { id: "webhooks-verify",   label: "Signature Verification" },
    ],
  },
]

// ─── Endpoint data ────────────────────────────────────────────────────────────

const ENDPOINTS: Endpoint[] = [
  {
    id: "ep-list",
    method: "GET",
    path: "/v1/qr",
    summary: "List QR Codes",
    description: "Returns a paginated list of the QR codes in your account, newest first by default. Use query parameters to filter, sort and paginate.",
    queryParams: [
      { name: "page",         type: "integer", desc: "Page number, 1-indexed. Default: 1" },
      { name: "limit",        type: "integer", desc: "Results per page. Default: 20. Max: 50" },
      { name: "type",         type: "string",  desc: "Filter by QR type (URL, PDF, WIFI, VCARD, …)" },
      { name: "search",       type: "string",  desc: "Matches QR code names (partial, case-insensitive) or an exact tag" },
      { name: "updatedSince", type: "string",  desc: "ISO 8601 timestamp — only QR codes updated at or after this time" },
      { name: "sort",         type: "string",  desc: "createdAt (default) or updatedAt — newest first" },
    ],
    responseFields: [
      { name: "data",                  type: "array",   desc: "Array of QR code objects" },
      { name: "pagination.page",       type: "integer", desc: "Current page number" },
      { name: "pagination.limit",      type: "integer", desc: "Results per page" },
      { name: "pagination.total",      type: "integer", desc: "Total number of matching QR codes" },
      { name: "pagination.totalPages", type: "integer", desc: "Total number of pages" },
      { name: "pagination.hasNext",    type: "boolean", desc: "Whether a later page exists" },
      { name: "pagination.hasPrev",    type: "boolean", desc: "Whether an earlier page exists" },
    ],
    codes: [
      { code: "200", desc: "Success — list returned" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "403", desc: "Your plan does not include API access (Pro or higher)" },
      { code: "422", desc: "Invalid query parameter" },
      { code: "429", desc: "Rate limit or monthly quota exceeded" },
    ],
    examples: {
      curl: `curl "https://genxqr.com/v1/qr?page=1&limit=20" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      node: `const res = await fetch('https://genxqr.com/v1/qr?page=1&limit=20', {
  headers: {
    'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`
  }
})
const { data, pagination } = await res.json()`,
      python: `import requests, os

res = requests.get(
    'https://genxqr.com/v1/qr',
    params={'page': 1, 'limit': 20},
    headers={'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}"}
)
data = res.json()`,
    },
    responseExample: `{
  "success": true,
  "data": [
    {
      "id": "clxxxxxxxxxxxxxxxx",
      "name": "Restaurant Menu",
      "type": "URL",
      "category": "DYNAMIC",
      "slug": "aB3dE5fG",
      "tags": ["menu"],
      "scanCount": 1243,
      "isActive": true,
      "createdAt": "2025-04-01T10:00:00.000Z",
      "updatedAt": "2025-04-14T08:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}`,
  },
  {
    id: "ep-create",
    method: "POST",
    path: "/v1/qr",
    summary: "Create QR Code",
    description: "Creates a new QR code. It is assigned a unique slug which is embedded in the scannable URL (https://genxqr.com/r/<slug>). New QR codes are active immediately.",
    bodyParams: [
      { name: "name",     type: "string",  required: true,  desc: "Display name for the QR code (max 200 characters)" },
      { name: "type",     type: "string",  required: true,  desc: "QR type. One of: URL, PDF, VIDEO, LINKS, SOCIAL_MEDIA, VCARD, IMAGE_GALLERY, BUSINESS, APP, MP3, MENU, WIFI, WHATSAPP, INSTAGRAM, FACEBOOK, COUPON" },
      { name: "content",  type: "object",                   desc: "Type-specific content, wrapped as { data: { … } }. See Content Schemas below." },
      { name: "category", type: "string",                   desc: "DYNAMIC (default) or STATIC" },
      { name: "tags",     type: "string[]",                 desc: "Up to 10 tags, max 50 characters each" },
      { name: "design",   type: "object",                   desc: "Colours, dot and corner styles, logo and frame — same fields as design in Get QR Code" },
      { name: "settings", type: "object",                   desc: "Optional: password, activeFrom, activeUntil, scanLimit, fallbackUrl, fbPixelId, gaId, gtmId" },
    ],
    responseFields: [
      { name: "id",        type: "string",  desc: "Unique QR code ID (CUID)" },
      { name: "name",      type: "string",  desc: "QR code display name" },
      { name: "slug",      type: "string",  desc: "Short identifier embedded in the scan URL" },
      { name: "type",      type: "string",  desc: "QR type" },
      { name: "category",  type: "string",  desc: "STATIC or DYNAMIC" },
      { name: "isActive",  type: "boolean", desc: "Whether the QR code is currently active" },
      { name: "createdAt", type: "string",  desc: "ISO 8601 creation timestamp" },
    ],
    codes: [
      { code: "201", desc: "QR code created successfully" },
      { code: "400", desc: "Expiry date is beyond your current subscription period" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "403", desc: "QR code limit reached, or your plan lacks API access or expiry dates" },
      { code: "422", desc: "Validation error — check request body" },
      { code: "429", desc: "Rate limit or monthly quota exceeded" },
    ],
    examples: {
      curl: `curl -X POST https://genxqr.com/v1/qr \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Product Launch",
    "type": "URL",
    "content": {
      "data": {
        "url": "https://yourproduct.com/launch"
      }
    },
    "tags": ["marketing", "product"]
  }'`,
      node: `const res = await fetch('https://genxqr.com/v1/qr', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Product Launch',
    type: 'URL',
    content: { data: { url: 'https://yourproduct.com/launch' } },
    tags: ['marketing', 'product']
  })
})
const { data } = await res.json()
console.log('Scan URL:', \`https://genxqr.com/r/\${data.slug}\`)`,
      python: `import requests, os

res = requests.post(
    'https://genxqr.com/v1/qr',
    headers={
        'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}",
        'Content-Type': 'application/json'
    },
    json={
        'name': 'Product Launch',
        'type': 'URL',
        'content': {'data': {'url': 'https://yourproduct.com/launch'}},
        'tags': ['marketing', 'product']
    }
)
data = res.json()['data']
print(f"Scan URL: https://genxqr.com/r/{data['slug']}")`,
    },
    responseExample: `{
  "success": true,
  "data": {
    "id": "clxxxxxxxxxxxxxxxx",
    "name": "Product Launch",
    "type": "URL",
    "category": "DYNAMIC",
    "slug": "xY7zW9qR",
    "tags": ["marketing", "product"],
    "scanCount": 0,
    "isActive": true,
    "createdAt": "2025-04-14T10:00:00.000Z",
    "updatedAt": "2025-04-14T10:00:00.000Z"
  }
}`,
  },
  {
    id: "ep-get",
    method: "GET",
    path: "/v1/qr/:id",
    summary: "Get QR Code",
    description: "Retrieves a single QR code by its ID, including its content and design configuration.",
    responseFields: [
      { name: "id",        type: "string",  desc: "Unique QR code ID" },
      { name: "name",      type: "string",  desc: "Display name" },
      { name: "slug",      type: "string",  desc: "Scan URL slug" },
      { name: "type",      type: "string",  desc: "QR type" },
      { name: "scanCount", type: "integer", desc: "Total number of scans recorded" },
      { name: "content",   type: "object",  desc: "Type-specific content data" },
      { name: "design",    type: "object",  desc: "Visual design configuration" },
      { name: "isActive",  type: "boolean", desc: "Active state" },
    ],
    codes: [
      { code: "200", desc: "QR code found and returned" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "404", desc: "QR code not found or belongs to another account" },
    ],
    examples: {
      curl: `curl https://genxqr.com/v1/qr/clxxxxxxxxxxxxxxxx \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      node: `const id = 'clxxxxxxxxxxxxxxxx'
const res = await fetch(\`https://genxqr.com/v1/qr/\${id}\`, {
  headers: {
    'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`
  }
})
const { data } = await res.json()`,
      python: `import requests, os

qr_id = 'clxxxxxxxxxxxxxxxx'
res = requests.get(
    f'https://genxqr.com/v1/qr/{qr_id}',
    headers={'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}"}
)
data = res.json()['data']`,
    },
    responseExample: `{
  "success": true,
  "data": {
    "id": "clxxxxxxxxxxxxxxxx",
    "name": "Product Launch",
    "type": "URL",
    "category": "DYNAMIC",
    "slug": "xY7zW9qR",
    "scanCount": 57,
    "isActive": true,
    "content": {
      "data": {
        "url": "https://yourproduct.com/launch"
      }
    },
    "design": {
      "dotStyle": "rounded",
      "primaryColor": "#7c3aed",
      "backgroundColor": "#ffffff"
    },
    "createdAt": "2025-04-14T10:00:00.000Z",
    "updatedAt": "2025-04-14T10:00:00.000Z"
  }
}`,
  },
  {
    id: "ep-update",
    method: "PATCH",
    path: "/v1/qr/:id",
    summary: "Update QR Code",
    description: "Updates an existing QR code. Only the fields you provide are changed — all others remain untouched. For dynamic QR codes, new content applies from the next scan, without reprinting. This endpoint does not change isActive — use Toggle QR Code for that.",
    bodyParams: [
      { name: "name",     type: "string",   desc: "New display name" },
      { name: "content",  type: "object",   desc: "New type-specific content, as { data: { … } }. Replaces existing content entirely." },
      { name: "tags",     type: "string[]", desc: "Replace the tag list (max 10)" },
      { name: "design",   type: "object",   desc: "Design fields to change — fields you omit keep their current value" },
      { name: "settings", type: "object",   desc: "password (\"\" removes it), activeFrom, activeUntil (ISO 8601, null to clear), scanLimit (null to clear), fallbackUrl, fbPixelId, gaId, gtmId" },
    ],
    responseFields: [
      { name: "id",        type: "string",  desc: "QR code ID" },
      { name: "updatedAt", type: "string",  desc: "ISO 8601 timestamp of the update" },
      { name: "…",         type: "",        desc: "Plus every other field returned by Get QR Code" },
    ],
    codes: [
      { code: "200", desc: "QR code updated successfully" },
      { code: "400", desc: "Expiry date is beyond your current subscription period" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "403", desc: "Your plan lacks API access or expiry dates" },
      { code: "404", desc: "QR code not found" },
    ],
    examples: {
      curl: `curl -X PATCH https://genxqr.com/v1/qr/clxxxxxxxxxxxxxxxx \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": {
      "data": {
        "url": "https://yourproduct.com/new-page"
      }
    },
    "settings": { "scanLimit": 500 }
  }'`,
      node: `const res = await fetch(\`https://genxqr.com/v1/qr/\${id}\`, {
  method: 'PATCH',
  headers: {
    'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    content: { data: { url: 'https://yourproduct.com/new-page' } },
    settings: { scanLimit: 500 }
  })
})
const { data } = await res.json()`,
      python: `res = requests.patch(
    f'https://genxqr.com/v1/qr/{qr_id}',
    headers={
        'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}",
        'Content-Type': 'application/json'
    },
    json={
        'content': {'data': {'url': 'https://yourproduct.com/new-page'}},
        'settings': {'scanLimit': 500}
    }
)`,
    },
    responseExample: `{
  "success": true,
  "data": {
    "id": "clxxxxxxxxxxxxxxxx",
    "name": "Product Launch",
    "type": "URL",
    "slug": "xY7zW9qR",
    "isActive": true,
    "scanLimit": 500,
    "updatedAt": "2025-04-14T11:30:00.000Z"
  }
}`,
  },
  {
    id: "ep-toggle",
    method: "PATCH",
    path: "/v1/qr/:id/toggle",
    summary: "Toggle QR Code",
    description: "Switches a QR code between active and inactive. When an inactive code is scanned, the visitor sees the deactivated page — or the code's fallback URL, if it has one. A code paused because your plan ended can only be switched back on by renewing.",
    responseFields: [
      { name: "id",       type: "string",  desc: "QR code ID" },
      { name: "isActive", type: "boolean", desc: "The new active state" },
      { name: "slug",     type: "string",  desc: "Scan URL slug" },
    ],
    codes: [
      { code: "200", desc: "Active state flipped" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "403", desc: "Code was paused because your plan ended — renew to switch it back on" },
      { code: "404", desc: "QR code not found" },
    ],
    examples: {
      curl: `curl -X PATCH https://genxqr.com/v1/qr/clxxxxxxxxxxxxxxxx/toggle \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      node: `const res = await fetch(\`https://genxqr.com/v1/qr/\${id}/toggle\`, {
  method: 'PATCH',
  headers: {
    'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`
  }
})
const { data } = await res.json()
console.log('Active:', data.isActive)`,
      python: `res = requests.patch(
    f'https://genxqr.com/v1/qr/{qr_id}/toggle',
    headers={'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}"}
)
print('Active:', res.json()['data']['isActive'])`,
    },
    responseExample: `{
  "success": true,
  "data": {
    "id": "clxxxxxxxxxxxxxxxx",
    "isActive": false,
    "slug": "xY7zW9qR"
  }
}`,
  },
  {
    id: "ep-delete",
    method: "DELETE",
    path: "/v1/qr/:id",
    summary: "Delete QR Code",
    description: "Permanently deletes a QR code and all its associated scan data. This action is irreversible. If you only want to stop a QR code from accepting scans without losing data, use Toggle QR Code instead.",
    responseFields: [
      { name: "(none)", type: "", desc: "Success returns 204 No Content with an empty body" },
    ],
    codes: [
      { code: "204", desc: "QR code permanently deleted" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "404", desc: "QR code not found" },
    ],
    examples: {
      curl: `curl -X DELETE https://genxqr.com/v1/qr/clxxxxxxxxxxxxxxxx \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      node: `const res = await fetch(\`https://genxqr.com/v1/qr/\${id}\`, {
  method: 'DELETE',
  headers: {
    'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`
  }
})
// res.status === 204 — no response body`,
      python: `res = requests.delete(
    f'https://genxqr.com/v1/qr/{qr_id}',
    headers={'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}"}
)
# res.status_code == 204 — no response body`,
    },
    responseExample: `HTTP/1.1 204 No Content`,
  },
  {
    id: "ep-analytics",
    method: "GET",
    path: "/v1/qr/:id/analytics",
    summary: "QR Analytics",
    description: "Returns scan analytics for a specific QR code: all-time totals, a daily timeline for the requested number of days, and breakdowns by device, OS, browser, country and city.",
    queryParams: [
      { name: "days", type: "integer", desc: "Days covered by the timeline and breakdowns. Default: 30. Max: 90" },
    ],
    responseFields: [
      { name: "totalScans",     type: "integer", desc: "All-time scan count, repeat scans included" },
      { name: "uniqueScans",    type: "integer", desc: "All-time unique scans — repeats from the same IP and browser within 4 hours count once" },
      { name: "scansToday",     type: "integer", desc: "Scans in the current UTC day" },
      { name: "scansThisWeek",  type: "integer", desc: "Scans in the last 7 days" },
      { name: "scansThisMonth", type: "integer", desc: "Scans in the last 30 days" },
      { name: "timeline",       type: "array",   desc: "Daily scan counts ({ date, count }) for the requested period" },
      { name: "byDevice",       type: "array",   desc: "Scan counts by deviceType: MOBILE, TABLET, DESKTOP, UNKNOWN" },
      { name: "byOS",           type: "array",   desc: "Scan counts per operating system" },
      { name: "byBrowser",      type: "array",   desc: "Scan counts per browser" },
      { name: "byCountry",      type: "array",   desc: "Top 20 countries ({ country, countryCode, count })" },
      { name: "byCity",         type: "array",   desc: "Top 20 cities ({ city, region, country, countryCode, count })" },
      { name: "recentScans",    type: "array",   desc: "Latest 50 scans with time, IP, location, device, OS, browser and referrer" },
    ],
    codes: [
      { code: "200", desc: "Analytics returned" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "404", desc: "QR code not found" },
    ],
    examples: {
      curl: `curl "https://genxqr.com/v1/qr/clxxxxxxxxxxxxxxxx/analytics?days=30" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      node: `const res = await fetch(
  \`https://genxqr.com/v1/qr/\${id}/analytics?days=30\`,
  {
    headers: {
      'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`
    }
  }
)
const { data } = await res.json()
console.log('Total scans:', data.totalScans)`,
      python: `res = requests.get(
    f'https://genxqr.com/v1/qr/{qr_id}/analytics',
    params={'days': 30},
    headers={'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}"}
)
analytics = res.json()['data']
print('Total scans:', analytics['totalScans'])`,
    },
    responseExample: `{
  "success": true,
  "data": {
    "totalScans": 1243,
    "uniqueScans": 987,
    "scansToday": 18,
    "scansThisWeek": 140,
    "scansThisMonth": 512,
    "timeline": [
      { "date": "2025-04-13", "count": 42 },
      { "date": "2025-04-14", "count": 18 }
    ],
    "byDevice": [
      { "deviceType": "MOBILE", "count": 890 },
      { "deviceType": "DESKTOP", "count": 290 }
    ],
    "byOS": [{ "os": "Android", "count": 610 }],
    "byBrowser": [{ "browser": "Chrome", "count": 720 }],
    "byCountry": [
      { "country": "India", "countryCode": "IN", "count": 830 }
    ],
    "byCity": [
      { "city": "Mumbai", "region": "Maharashtra", "country": "India", "countryCode": "IN", "count": 214 }
    ],
    "recentScans": [ … ]
  }
}`,
  },
  {
    id: "ep-scans",
    method: "GET",
    path: "/v1/qr/:id/scans",
    summary: "List Scans",
    description: "Returns individual scans for a QR code, newest first. Each scan has a stable id, so polling integrations can de-duplicate.",
    queryParams: [
      { name: "limit", type: "integer", desc: "Number of scans to return. Default: 25. Max: 100" },
      { name: "since", type: "string",  desc: "ISO 8601 timestamp — only scans at or after this time" },
    ],
    responseFields: [
      { name: "data",                type: "array",  desc: "Array of scan objects" },
      { name: "data[].id",           type: "string", desc: "Scan ID" },
      { name: "data[].scannedAt",    type: "string", desc: "ISO 8601 scan time" },
      { name: "data[].country",      type: "string", desc: "Country, with countryCode, city and region alongside" },
      { name: "data[].deviceType",   type: "string", desc: "MOBILE, TABLET, DESKTOP or UNKNOWN" },
      { name: "data[].os / browser", type: "string", desc: "Operating system and browser" },
      { name: "data[].referrer",     type: "string", desc: "Referer header, if the scanner sent one" },
    ],
    codes: [
      { code: "200", desc: "Scans returned" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "404", desc: "QR code not found" },
      { code: "422", desc: "Invalid query parameter" },
    ],
    examples: {
      curl: `curl "https://genxqr.com/v1/qr/clxxxxxxxxxxxxxxxx/scans?limit=25" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      node: `const res = await fetch(
  \`https://genxqr.com/v1/qr/\${id}/scans?limit=25\`,
  { headers: { 'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\` } }
)
const { data } = await res.json()`,
      python: `res = requests.get(
    f'https://genxqr.com/v1/qr/{qr_id}/scans',
    params={'limit': 25},
    headers={'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}"}
)
scans = res.json()['data']`,
    },
    responseExample: `{
  "success": true,
  "data": [
    {
      "id": "clyyyyyyyyyyyyyyyy",
      "qrId": "clxxxxxxxxxxxxxxxx",
      "scannedAt": "2025-04-14T10:30:00.000Z",
      "country": "India",
      "countryCode": "IN",
      "city": "Mumbai",
      "region": "Maharashtra",
      "deviceType": "MOBILE",
      "os": "Android",
      "browser": "Chrome",
      "referrer": null
    }
  ]
}`,
  },
]

const ANALYTICS_IDS = ["ep-analytics", "ep-scans"]

// ─── Small components ─────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className={cn("flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors", className)}
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-bold font-mono", METHOD_COLOR[method])}>
      {method}
    </span>
  )
}

function FieldTable({ fields, title }: { fields: Field[]; title: string }) {
  return (
    <div className="mb-6">
      <h4 className="text-xs font-semibold text-ink-faint uppercase tracking-wider mb-3">{title}</h4>
      <div className="min-w-0 border border-line rounded-xl overflow-x-auto">
        <table className="w-full min-w-[380px] text-xs">
          <thead>
            <tr className="border-b border-line bg-paper-pure">
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium w-36">Name</th>
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium w-24">Type</th>
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.name} className={cn("border-b border-line/60 last:border-0", i % 2 === 0 ? "bg-transparent" : "bg-ink/[0.02]")}>
                <td className="px-4 py-2.5 font-mono text-accent align-top">
                  {f.name}
                  {f.required && <span className="ml-1 text-red-600 dark:text-red-400">*</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-ink-faint align-top">{f.type}</td>
                <td className="px-4 py-2.5 text-ink-soft align-top leading-relaxed">{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fields.some((f) => f.required) && (
        <p className="text-ink-faint text-xs mt-1.5"><span className="text-red-600 dark:text-red-400">*</span> Required</p>
      )}
    </div>
  )
}

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  // Simple token colouring for common patterns
  return (
    <div className="relative group min-w-0">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60">
          <span className="text-zinc-600 text-xs font-mono">{lang}</span>
          <CopyButton text={code} />
        </div>
        <pre className="p-4 overflow-x-auto text-xs leading-relaxed text-zinc-300 font-mono">{code}</pre>
      </div>
    </div>
  )
}

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const LANGS: { id: Lang; label: string }[] = [
    { id: "curl",   label: "curl" },
    { id: "node",   label: "Node.js" },
    { id: "python", label: "Python" },
  ]
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-paper-pure border border-line w-fit">
      {LANGS.map((l) => (
        <button
          key={l.id}
          onClick={() => setLang(l.id)}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-medium transition-colors",
            lang === l.id ? "bg-ink text-paper" : "text-ink-faint hover:text-ink"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

// ─── Endpoint section ─────────────────────────────────────────────────────────

function EndpointSection({ ep, lang }: { ep: Endpoint; lang: Lang }) {
  return (
    <section id={ep.id} className="scroll-mt-32 mb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <MethodBadge method={ep.method} />
        <code className="min-w-0 break-all text-ink text-sm font-mono bg-paper-pure border border-line px-3 py-1 rounded-lg">
          {ep.path}
        </code>
      </div>
      <h3 className="text-ink font-display font-bold text-xl mb-2">{ep.summary}</h3>
      <p className="text-ink-soft text-sm leading-relaxed mb-6">{ep.description}</p>

      {/* Request */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {ep.queryParams && <FieldTable fields={ep.queryParams} title="Query Parameters" />}
          {ep.bodyParams && <FieldTable fields={ep.bodyParams} title="Request Body" />}
          <FieldTable fields={ep.responseFields} title="Response Fields" />

          <div>
            <h4 className="text-xs font-semibold text-ink-faint uppercase tracking-wider mb-3">Status Codes</h4>
            <div className="space-y-2">
              {ep.codes.map((c) => (
                <div key={c.code} className="flex items-center gap-3 text-xs">
                  <span className={cn(
                    "font-mono font-bold w-10 shrink-0",
                    c.code.startsWith("2") ? "text-emerald-600 dark:text-emerald-400"
                      : c.code.startsWith("4") ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400"
                  )}>{c.code}</span>
                  <span className="text-ink-faint">{c.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <CodeBlock code={ep.examples[lang]} lang={lang === "curl" ? "bash" : lang} />
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60">
              <span className="text-zinc-600 text-xs font-mono">Response</span>
              <CopyButton text={ep.responseExample} />
            </div>
            <pre className="p-4 overflow-x-auto text-xs leading-relaxed text-emerald-300/80 font-mono">{ep.responseExample}</pre>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-line" />
    </section>
  )
}

// ─── Error codes ──────────────────────────────────────────────────────────────

const ERROR_CODES = [
  { code: "400", title: "Bad Request",           desc: "The request is valid but can't be applied — for example an expiry date beyond your current subscription period, or an unusable webhook URL." },
  { code: "401", title: "Unauthorized",          desc: "Missing, invalid, revoked or expired API key. Ensure your Authorization header is set correctly." },
  { code: "403", title: "Forbidden",             desc: "Your current plan doesn't include API access or this feature, or you've reached a plan limit such as your QR code allowance. Upgrade to continue." },
  { code: "404", title: "Not Found",             desc: "The requested resource doesn't exist or belongs to another account." },
  { code: "422", title: "Unprocessable Entity",  desc: "The request body or query parameters failed validation. The response includes a details object listing each invalid field." },
  { code: "429", title: "Too Many Requests",     desc: "You exceeded the per-minute rate limit (the response includes a Retry-After header) or your plan's monthly API call quota." },
  { code: "500", title: "Internal Server Error", desc: "An unexpected error occurred on our side. These are logged. Please retry after a moment." },
]

// ─── Webhook events ───────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  {
    event: "qr.scanned",
    desc: "Fired on every scan, including repeat scans from the same device. Location and device details are not included — fetch them from List Scans.",
    payload: `{
  "event": "qr.scanned",
  "timestamp": "2025-04-14T10:30:01.000Z",
  "data": {
    "qrId": "clxxxxxxxxxxxxxxxx",
    "name": "Restaurant Menu",
    "slug": "aB3dE5fG",
    "scannedAt": "2025-04-14T10:30:00.000Z"
  }
}`,
  },
  {
    event: "qr.created",
    desc: "Fired when a new QR code is created, whether via the dashboard or the API. data.qr is the full QR code object.",
    payload: `{
  "event": "qr.created",
  "timestamp": "2025-04-14T10:00:00.000Z",
  "data": {
    "qr": {
      "id": "clxxxxxxxxxxxxxxxx",
      "name": "Product Launch",
      "type": "URL",
      "slug": "xY7zW9qR",
      "isActive": true,
      "createdAt": "2025-04-14T10:00:00.000Z"
    }
  }
}`,
  },
  {
    event: "qr.updated",
    desc: "Fired when a QR code is edited. data.qr is the full updated QR code object.",
    payload: `{
  "event": "qr.updated",
  "timestamp": "2025-04-14T11:00:00.000Z",
  "data": {
    "qr": {
      "id": "clxxxxxxxxxxxxxxxx",
      "name": "Product Launch",
      "updatedAt": "2025-04-14T11:00:00.000Z"
    }
  }
}`,
  },
  {
    event: "qr.deleted",
    desc: "Fired when a QR code is permanently deleted.",
    payload: `{
  "event": "qr.deleted",
  "timestamp": "2025-04-14T12:00:00.000Z",
  "data": {
    "qrId": "clxxxxxxxxxxxxxxxx",
    "name": "Product Launch"
  }
}`,
  },
  {
    event: "subscription.activated",
    desc: "Fired when a payment activates or renews your plan.",
    payload: `{
  "event": "subscription.activated",
  "timestamp": "2025-04-14T12:00:00.000Z",
  "data": { "planName": "PRO", "billingCycle": "monthly" }
}`,
  },
  {
    event: "subscription.cancelled",
    desc: "Fired when you cancel your plan. It stays active until the end of the current period.",
    payload: `{
  "event": "subscription.cancelled",
  "timestamp": "2025-04-14T12:00:00.000Z",
  "data": { "cancelAtPeriodEnd": true }
}`,
  },
  {
    event: "test",
    desc: "Sent when you press Test on a webhook in the dashboard. Delivered once, never retried.",
    payload: `{
  "event": "test",
  "timestamp": "2025-04-14T12:00:00.000Z",
  "data": {
    "message": "This is a test event from GenXQR",
    "webhookId": "clzzzzzzzzzzzzzzzz"
  }
}`,
  },
]

// ─── Content sections ─────────────────────────────────────────────────────────

function IntroSection() {
  return (
    <section id="introduction" className="scroll-mt-32 mb-16">
      <h2 className="text-ink font-display font-bold text-2xl mb-4">Introduction</h2>
      <p className="text-ink-soft text-sm leading-relaxed mb-4">
        The GenXQR REST API lets you create, manage, and analyse QR codes programmatically. Integrate QR code generation into your product, automate workflows, and pull scan analytics — all from your server.
      </p>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[
          { icon: <Shield size={16} />, title: "API key auth", desc: "Simple Bearer token authentication — no OAuth dance." },
          { icon: <Zap size={16} />,    title: "REST + JSON",  desc: "Standard HTTP verbs, predictable JSON responses everywhere." },
          { icon: <Radio size={16} />,  title: "Webhooks",     desc: "Push events to your server the instant something happens." },
        ].map((c) => (
          <div key={c.title} className="border border-line rounded-xl p-4 bg-paper-pure">
            <div className="text-accent mb-2">{c.icon}</div>
            <p className="text-ink text-xs font-semibold mb-1">{c.title}</p>
            <p className="text-ink-faint text-xs leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
      <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
        <div className="bg-zinc-900/60 px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-zinc-500 text-xs font-mono">Base URL</span>
          <CopyButton text="https://genxqr.com/v1" />
        </div>
        <div className="p-4 font-mono text-sm">
          <span className="text-zinc-500">https://genxqr.com/</span><span className="text-violet-300">v1</span>
        </div>
      </div>
      <div className="mt-4 border-t border-line" />
    </section>
  )
}

function AuthSection() {
  return (
    <section id="authentication" className="scroll-mt-32 mb-16">
      <h2 className="text-ink font-display font-bold text-2xl mb-4">Authentication</h2>
      <p className="text-ink-soft text-sm leading-relaxed mb-4">
        All API requests require an API key passed in the <code className="text-accent bg-accent-soft px-1 rounded">Authorization</code> header using the Bearer scheme. Generate a key from{" "}
        <Link to="/app/api-keys" className="text-accent hover:text-accent-ink underline underline-offset-2">API Keys</Link> in your dashboard.
        API access requires the Pro plan or higher — keys return 403 if the account drops below Pro — and each account can hold up to 10 keys.
      </p>
      <CodeBlock lang="bash" code={`# Every request must include this header
curl https://genxqr.com/v1/qr \\
  -H "Authorization: Bearer gxqr_live_••••••••••••••••••••••••••••••••"`} />
      <div className="mt-4 p-4 border border-amber-500/20 bg-amber-500/10 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-700 dark:text-amber-300 text-xs font-semibold mb-1">Keep your key secret</p>
            <p className="text-ink-soft text-xs leading-relaxed">
              API keys have no scopes: any key can read, create, change and delete every QR code and webhook in your account. Store them in environment variables (<code className="text-amber-700 dark:text-amber-300">GenXQR_API_KEY</code>), never in client-side code or source files.
              If a key is exposed, revoke it immediately from the dashboard and generate a replacement.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6 border-t border-line" />
    </section>
  )
}

function RateLimitsSection() {
  return (
    <section id="rate-limits" className="scroll-mt-32 mb-16">
      <h2 className="text-ink font-display font-bold text-2xl mb-4">Rate Limits</h2>
      <p className="text-ink-soft text-sm leading-relaxed mb-4">
        Rate limits are applied per account — every API key on the account shares the same budget. When you exceed the per-minute limit, the API responds with <code className="text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1 rounded">HTTP 429</code> and a <code className="text-ink-soft bg-paper-pure border border-line px-1 rounded">Retry-After</code> header telling you how many seconds to wait.
      </p>
      <div className="border border-line rounded-xl overflow-hidden mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-paper-pure">
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium">Limit</th>
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium">Value</th>
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Per-minute rate", "300 req / min",   "Per account, across all /v1 endpoints"],
              ["Monthly quota",   "10,000 (Pro) · 100,000 (Business)", "Calls per calendar month (UTC); over-quota calls get 429 without Retry-After"],
              ["Retry-After",     "Seconds to wait", "Included in per-minute 429 responses"],
            ].map(([label, val, note], i) => (
              <tr key={label} className={cn("border-b border-line/60 last:border-0", i % 2 === 1 ? "bg-ink/[0.02]" : "")}>
                <td className="px-4 py-2.5 text-ink">{label}</td>
                <td className="px-4 py-2.5 font-mono text-accent">{val}</td>
                <td className="px-4 py-2.5 text-ink-faint">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CodeBlock lang="bash" code={`# Rate limit response
HTTP/1.1 429 Too Many Requests
Retry-After: 14
Content-Type: application/json

{
  "success": false,
  "error": "API rate limit exceeded (300 req/min). Slow down or contact support to raise your cap."
}`} />
      <div className="mt-6 border-t border-line" />
    </section>
  )
}

function ErrorsSection() {
  return (
    <section id="errors" className="scroll-mt-32 mb-16">
      <h2 className="text-ink font-display font-bold text-2xl mb-4">Error Codes</h2>
      <p className="text-ink-soft text-sm leading-relaxed mb-4">
        Errors always return a JSON body with <code className="text-accent bg-accent-soft px-1 rounded">success: false</code> and a human-readable <code className="text-accent bg-accent-soft px-1 rounded">error</code> field. Validation errors (422) additionally include a <code className="text-accent bg-accent-soft px-1 rounded">details</code> object mapping each invalid field to its messages.
      </p>
      <CodeBlock lang="json" code={`// Standard error response
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "name": ["Required"],
    "type": ["Invalid enum value. Expected 'URL' | 'PDF' | …, received 'LINK'"]
  }
}`} />
      <div className="mt-4 border border-line rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-paper-pure">
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium w-14">Code</th>
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium w-44">Title</th>
              <th className="text-left px-4 py-2.5 text-ink-faint font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {ERROR_CODES.map((e, i) => (
              <tr key={e.code} className={cn("border-b border-line/60 last:border-0", i % 2 === 1 ? "bg-ink/[0.02]" : "")}>
                <td className="px-4 py-3 font-mono font-bold text-amber-600 dark:text-amber-400 align-top">{e.code}</td>
                <td className="px-4 py-3 text-ink align-top">{e.title}</td>
                <td className="px-4 py-3 text-ink-faint leading-relaxed align-top">{e.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 border-t border-line" />
    </section>
  )
}

function PaginationSection() {
  return (
    <section id="pagination" className="scroll-mt-32 mb-16">
      <h2 className="text-ink font-display font-bold text-2xl mb-4">Pagination</h2>
      <p className="text-ink-soft text-sm leading-relaxed mb-4">
        <code className="text-accent bg-accent-soft px-1 rounded">GET /v1/qr</code> uses page-based pagination. Pass <code className="text-accent bg-accent-soft px-1 rounded">page</code> and <code className="text-accent bg-accent-soft px-1 rounded">limit</code> (max 50) as query parameters; the response includes a <code className="text-accent bg-accent-soft px-1 rounded">pagination</code> object. List Scans uses <code className="text-accent bg-accent-soft px-1 rounded">limit</code> and <code className="text-accent bg-accent-soft px-1 rounded">since</code> instead.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <CodeBlock lang="bash" code={`# Request page 3, 50 items per page
curl "https://genxqr.com/v1/qr?page=3&limit=50" \\
  -H "Authorization: Bearer YOUR_API_KEY"`} />
        <CodeBlock lang="json" code={`// pagination object in the list response
"pagination": {
  "total": 142,
  "page": 3,
  "limit": 50,
  "totalPages": 3,
  "hasNext": false,
  "hasPrev": true
}`} />
      </div>
      <div className="mt-6 border-t border-line" />
    </section>
  )
}

function WebhooksSection() {
  return (
    <>
      <section id="webhooks-overview" className="scroll-mt-32 mb-16">
        <h2 className="text-ink font-display font-bold text-2xl mb-4">Webhooks — Overview</h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-4">
          Webhooks let GenXQR push HTTP notifications to your server in real time when events occur in your account. Instead of polling the API, your server receives a POST request the moment something happens.
        </p>
        <p className="text-ink-soft text-sm leading-relaxed mb-4">
          Create and manage webhooks from the{" "}
          <Link to="/app/webhooks" className="text-accent hover:text-accent-ink underline underline-offset-2">Webhooks</Link>{" "}
          page in your dashboard. Each webhook has its own HMAC secret used to verify requests.
        </p>
        <p className="text-ink-soft text-sm leading-relaxed mb-4">
          Webhooks require the Pro plan or higher, and each account can have up to 20. URLs must use HTTPS. A delivery counts as successful on any 2xx response within 10 seconds; redirects are not followed. Failed deliveries are retried up to 5 attempts in total — after 30 seconds, 2 minutes, 8 minutes and 32 minutes. Integrations can also subscribe with <code className="text-accent bg-accent-soft px-1 rounded">POST /v1/webhooks</code> and a <code className="text-accent bg-accent-soft px-1 rounded">{"{ url, event }"}</code> body.
        </p>
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-950 font-mono text-xs space-y-1.5 mb-4">
          <p><span className="text-violet-300">POST</span> <span className="text-zinc-300">https://your-server.com/webhook</span></p>
          <p><span className="text-zinc-500">Content-Type:</span> <span className="text-zinc-300">application/json</span></p>
          <p><span className="text-zinc-500">X-GenXQR-Signature:</span> <span className="text-zinc-300">sha256=&lt;HMAC-SHA256&gt;</span></p>
          <p><span className="text-zinc-500">X-GenXQR-Event:</span> <span className="text-zinc-300">qr.scanned</span></p>
          <p><span className="text-zinc-500">X-GenXQR-Attempt:</span> <span className="text-zinc-300">1</span></p>
          <p><span className="text-zinc-500">User-Agent:</span> <span className="text-zinc-300">GenXQR-Webhooks/1.0</span></p>
        </div>
        <div className="mt-4 border-t border-line" />
      </section>

      <section id="webhooks-events" className="scroll-mt-32 mb-16">
        <h2 className="text-ink font-display font-bold text-2xl mb-4">Events & Payloads</h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-6">
          Subscribe to any combination of the events below when creating a webhook. Every delivery uses the same envelope: <code className="text-accent bg-accent-soft px-1 rounded">{"{ event, timestamp, data }"}</code>.
        </p>
        <div className="space-y-5">
          {WEBHOOK_EVENTS.map((ev) => (
            <div key={ev.event} className="border border-line rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-paper-pure border-b border-line">
                <code className="text-accent text-sm font-mono font-semibold">{ev.event}</code>
              </div>
              <div className="p-4">
                <p className="text-ink-soft text-xs leading-relaxed mb-3">{ev.desc}</p>
                <CodeBlock lang="json" code={ev.payload} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-line" />
      </section>

      <section id="webhooks-verify" className="scroll-mt-32 mb-16">
        <h2 className="text-ink font-display font-bold text-2xl mb-4">Signature Verification</h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-4">
          Every webhook request includes an <code className="text-accent bg-accent-soft px-1 rounded">X-GenXQR-Signature</code> header containing <code className="text-accent bg-accent-soft px-1 rounded">sha256=&lt;HMAC&gt;</code>. The HMAC is computed from the raw request body using your webhook secret. Always verify this before processing the payload.
        </p>
        <div className="p-4 border border-amber-500/20 bg-amber-500/10 rounded-xl mb-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-ink-soft text-xs leading-relaxed">
              Use <strong className="text-amber-700 dark:text-amber-300">timing-safe comparison</strong> when checking the signature.
              Standard string equality (<code className="text-red-600 dark:text-red-400">===</code>) is vulnerable to timing attacks.
              Use <code className="text-amber-700 dark:text-amber-300">crypto.timingSafeEqual</code> in Node.js or <code className="text-amber-700 dark:text-amber-300">hmac.compare_digest</code> in Python.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <CodeBlock lang="javascript" code={`// Node.js — Express
const crypto = require('crypto')

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig      = req.headers['x-genxqr-signature'] ?? ''  // Node lower-cases header names
  const body     = req.body   // raw Buffer — do NOT parse before verifying
  const secret   = process.env.GenXQR_WEBHOOK_SECRET

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).send('Invalid signature')
  }

  const event = JSON.parse(body)
  console.log('Received:', event.event)

  // Acknowledge immediately, process asynchronously
  res.sendStatus(200)
  processEvent(event)
})`} />
          <CodeBlock lang="python" code={`# Python — FastAPI
import hmac, hashlib, json, os
from fastapi import BackgroundTasks, Request, HTTPException

@app.post("/webhook")
async def handle_webhook(request: Request, background_tasks: BackgroundTasks):
    body   = await request.body()
    sig    = request.headers.get("x-genxqr-signature", "")
    secret = os.environ["GenXQR_WEBHOOK_SECRET"].encode()

    expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")

    event = json.loads(body)
    print("Received:", event["event"])

    # Return 200 immediately, queue heavy processing
    background_tasks.add_task(process_event, event)
    return {"ok": True}`} />
        </div>
      </section>
    </>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ activeSection, onNav }: { activeSection: string; onNav: (id: string) => void }) {
  const ENDPOINT_ICONS: Record<string, React.ReactNode> = {
    "ep-list":      <List size={12} />,
    "ep-create":    <Plus size={12} />,
    "ep-get":       <Eye size={12} />,
    "ep-update":    <Pencil size={12} />,
    "ep-toggle":    <Power size={12} />,
    "ep-delete":    <Trash2 size={12} />,
    "ep-analytics": <BarChart2 size={12} />,
    "ep-scans":     <ScanLine size={12} />,
  }

  return (
    <nav className="space-y-6">
      {NAV.map((section) => (
        <div key={section.group}>
          <div className="flex items-center gap-1.5 text-ink-faint text-[11px] font-semibold uppercase tracking-wider mb-2">
            {section.icon}
            {section.group}
          </div>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onNav(item.id)
                    document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }}
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors",
                    activeSection === item.id
                      ? "bg-accent-soft text-accent border border-accent/20"
                      : "text-ink-faint hover:text-ink hover:bg-ink/5"
                  )}
                >
                  {ENDPOINT_ICONS[item.id] && (
                    <span className="text-ink-faint/70">{ENDPOINT_ICONS[item.id]}</span>
                  )}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function APIDocsPage() {
  const [lang, setLang] = useState<Lang>("curl")
  const [activeSection, setActiveSection] = useState("introduction")
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Track active section via scroll
  useEffect(() => {
    const allIds = NAV.flatMap((s) => s.items.map((i) => i.id))
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { rootMargin: "-20% 0px -70% 0px" }
    )
    allIds.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const handleNav = (id: string) => {
    setActiveSection(id)
    setMobileSidebarOpen(false)
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEOMeta
        title="API Reference — GenXQR"
        description="Full REST API reference for GenXQR. Create and manage QR codes, fetch analytics, and receive webhook events programmatically."
        url="/api-docs"
      />

      {/* ── Top bar ── */}
      <div className="sticky top-16 z-40 border-b border-line bg-paper/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="lg:hidden shrink-0 text-ink-faint hover:text-ink transition-colors"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            >
              {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden sm:inline text-ink-faint">API Reference</span>
              <ChevronRight size={14} className="hidden sm:inline shrink-0 text-ink-faint/50" />
              <span className="truncate text-ink capitalize">{activeSection.replace("ep-", "").replace("-", " ")}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LangToggle lang={lang} setLang={setLang} />
            <Link
              to="/app/api-keys"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-ink text-white text-xs font-semibold transition-colors"
            >
              <Key size={13} />
              Get API Key
            </Link>
          </div>
        </div>
      </div>

      {/* ── Mobile sidebar overlay ── */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
          <div className="absolute left-0 top-[7.5rem] bottom-0 w-64 bg-paper-pure border-r border-line overflow-y-auto p-5">
            <Sidebar activeSection={activeSection} onNav={handleNav} />
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="max-w-7xl mx-auto flex">

        {/* Left sidebar — desktop */}
        <aside className="hidden lg:block w-60 shrink-0 sticky top-[7.5rem] self-start h-[calc(100vh-7.5rem)] overflow-y-auto border-r border-line/60 py-8 pr-4 pl-4">
          <Sidebar activeSection={activeSection} onNav={handleNav} />
        </aside>

        {/* Main content */}
        <main ref={contentRef} className="flex-1 min-w-0 px-6 lg:px-10 py-10 max-w-none">

          {/* Hero */}
          <div className="mb-14 pb-10 border-b border-line">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft border border-accent/20 text-accent text-xs font-medium mb-4">
              <Zap size={12} />
              REST API · v1
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-ink mb-3">
              GenXQR API Reference
            </h1>
            <p className="text-ink-soft text-base leading-relaxed max-w-2xl mb-6">
              A clean, predictable REST API to create, update, and manage QR codes and analytics from any language or platform.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/app/api-keys"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-ink text-white text-sm font-semibold transition-colors"
              >
                <Key size={14} />
                Get your API key
              </Link>
              <Link
                to="/app/webhooks"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-line hover:border-ink/30 text-ink-soft hover:text-ink text-sm font-medium transition-colors"
              >
                <Radio size={14} />
                Set up webhooks
              </Link>
            </div>
          </div>

          {/* Content sections */}
          <IntroSection />
          <AuthSection />
          <RateLimitsSection />
          <ErrorsSection />
          <PaginationSection />

          <div className="mb-8">
            <h2 className="text-ink font-display font-bold text-2xl mb-1">QR Codes</h2>
            <p className="text-ink-faint text-sm mb-8">Create, read, update, and delete QR codes in your account.</p>
          </div>

          {ENDPOINTS.filter((ep) => !ANALYTICS_IDS.includes(ep.id)).map((ep) => (
            <EndpointSection key={ep.id} ep={ep} lang={lang} />
          ))}

          <div className="mb-8">
            <h2 className="text-ink font-display font-bold text-2xl mb-1">Analytics</h2>
            <p className="text-ink-faint text-sm mb-8">Retrieve scan analytics for your QR codes.</p>
          </div>

          {ENDPOINTS.filter((ep) => ANALYTICS_IDS.includes(ep.id)).map((ep) => (
            <EndpointSection key={ep.id} ep={ep} lang={lang} />
          ))}

          <WebhooksSection />

          {/* Content types reference */}
          <section className="scroll-mt-32 mb-16">
            <h2 className="text-ink font-display font-bold text-2xl mb-4">Content Schemas</h2>
            <p className="text-ink-soft text-sm leading-relaxed mb-6">
              The <code className="text-accent bg-accent-soft px-1 rounded">content</code> field structure depends on the QR type. Below are examples for the most common types.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { type: "URL", schema: `{ "data": { "url": "https://example.com" } }` },
                { type: "WIFI", schema: `{ "data": { "ssid": "My Network", "password": "secret", "security": "WPA" } }` },
                { type: "WHATSAPP", schema: `{ "data": { "phone": "+919876543210", "message": "Hello!" } }` },
                { type: "INSTAGRAM", schema: `{ "data": { "username": "yourhandle" } }` },
                { type: "VCARD", schema: `{ "data": { "fullName": "Raj Sharma", "organization": "Acme", "title": "Founder", "phone": "+91...", "email": "raj@..." } }` },
                { type: "FACEBOOK", schema: `{ "data": { "url": "https://facebook.com/yourpage" } }` },
              ].map((item) => (
                <div key={item.type} className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
                  <div className="px-4 py-2.5 bg-zinc-900/50 border-b border-zinc-800">
                    <code className="text-violet-300 text-xs font-mono font-semibold">{item.type}</code>
                  </div>
                  <pre className="p-4 text-xs text-zinc-400 font-mono leading-relaxed overflow-x-auto">{item.schema}</pre>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="border border-line rounded-2xl p-8 bg-paper-pure text-center">
            <h3 className="text-ink font-display font-bold text-xl mb-2">Ready to build?</h3>
            <p className="text-ink-soft text-sm mb-6 max-w-md mx-auto">
              Get your API key from the dashboard and make your first API call in under 60 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/app/api-keys"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-ink text-white text-sm font-semibold transition-colors"
              >
                <Key size={15} />
                Get API Key
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-line hover:border-ink/30 text-ink-soft hover:text-ink text-sm font-medium transition-colors"
              >
                Create free account
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>

          <p className="text-ink-faint text-xs text-center mt-10">
            Questions? <Link to="/contact" className="text-ink-soft hover:text-ink underline underline-offset-2">Contact support</Link>
          </p>
        </main>
      </div>
    </div>
  )
}
