import { useState, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import {
  Copy, Check, Key, ChevronRight, Menu, X,
  BookOpen, Shield, Zap, AlertTriangle, Radio,
  List, Plus, Eye, Pencil, Trash2, BarChart2,
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
      { id: "ep-delete", label: "Delete QR Code" },
    ],
  },
  {
    group: "Analytics",
    icon: <BarChart2 size={13} />,
    items: [
      { id: "ep-analytics", label: "QR Analytics" },
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
    description: "Returns a paginated list of all QR codes in your account, ordered by creation date descending. Use query parameters to filter and paginate.",
    queryParams: [
      { name: "page",   type: "integer", desc: "Page number, 1-indexed. Default: 1" },
      { name: "limit",  type: "integer", desc: "Results per page. Default: 20. Max: 100" },
      { name: "type",   type: "string",  desc: "Filter by QR type (URL, PDF, WIFI, VCARD, …)" },
      { name: "search", type: "string",  desc: "Search by QR code name (partial match)" },
    ],
    responseFields: [
      { name: "data",            type: "array",   desc: "Array of QR code objects" },
      { name: "meta.page",       type: "integer", desc: "Current page number" },
      { name: "meta.limit",      type: "integer", desc: "Results per page" },
      { name: "meta.total",      type: "integer", desc: "Total number of QR codes" },
      { name: "meta.totalPages", type: "integer", desc: "Total number of pages" },
    ],
    codes: [
      { code: "200", desc: "Success — list returned" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "429", desc: "Rate limit exceeded" },
    ],
    examples: {
      curl: `curl https://genxqr.com/v1/qr?page=1&limit=20 \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      node: `const res = await fetch('https://genxqr.com/v1/qr?page=1&limit=20', {
  headers: {
    'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`
  }
})
const { data, meta } = await res.json()`,
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
      "slug": "abc123",
      "scanCount": 1243,
      "isActive": true,
      "createdAt": "2025-04-01T10:00:00.000Z",
      "updatedAt": "2025-04-14T08:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}`,
  },
  {
    id: "ep-create",
    method: "POST",
    path: "/v1/qr",
    summary: "Create QR Code",
    description: "Creates a new dynamic QR code. The QR code will be assigned a unique slug which is embedded in the scannable URL (https://genxqr.com/r/<slug>).",
    bodyParams: [
      { name: "name",     type: "string",  required: true,  desc: "Display name for the QR code (max 128 characters)" },
      { name: "type",     type: "string",  required: true,  desc: "QR type. One of: URL, PDF, VIDEO, WIFI, VCARD, MENU, SOCIAL_MEDIA, IMAGE_GALLERY, APP, MP3, BUSINESS, WHATSAPP, INSTAGRAM, FACEBOOK, COUPON" },
      { name: "content",  type: "object",  required: true,  desc: "Type-specific content object. See content schemas below." },
      { name: "tags",     type: "string[]",               desc: "Array of tag strings for organisation" },
      { name: "isActive", type: "boolean",               desc: "Whether the QR is immediately active. Default: true" },
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
      { code: "400", desc: "Validation error — check request body" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "403", desc: "Plan limit reached — upgrade your plan" },
      { code: "429", desc: "Rate limit exceeded" },
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
    "slug": "xyz789",
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
    "slug": "xyz789",
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
    description: "Updates the name, content, or settings of an existing QR code. Only the fields you provide are changed — all others remain untouched. For dynamic QR codes, updating the content takes effect immediately for all future scans without reprinting.",
    bodyParams: [
      { name: "name",       type: "string",  desc: "New display name" },
      { name: "content",    type: "object",  desc: "New type-specific content object. Replaces existing content entirely." },
      { name: "isActive",   type: "boolean", desc: "Enable (true) or disable (false) the QR code" },
      { name: "tags",       type: "string[]",desc: "Replace tag list" },
      { name: "scanLimit",  type: "integer", desc: "Maximum allowed scans. Set null to remove limit." },
      { name: "activeUntil",type: "string",  desc: "ISO 8601 expiry date. Set null to remove expiry." },
    ],
    responseFields: [
      { name: "id",        type: "string",  desc: "QR code ID" },
      { name: "updatedAt", type: "string",  desc: "ISO 8601 timestamp of the update" },
    ],
    codes: [
      { code: "200", desc: "QR code updated successfully" },
      { code: "400", desc: "Validation error" },
      { code: "401", desc: "Invalid or missing API key" },
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
    "isActive": true
  }'`,
      node: `const res = await fetch(\`https://genxqr.com/v1/qr/\${id}\`, {
  method: 'PATCH',
  headers: {
    'Authorization': \`Bearer \${process.env.GenXQR_API_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    content: { data: { url: 'https://yourproduct.com/new-page' } },
    isActive: true
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
        'isActive': True
    }
)`,
    },
    responseExample: `{
  "success": true,
  "data": {
    "id": "clxxxxxxxxxxxxxxxx",
    "name": "Product Launch",
    "type": "URL",
    "slug": "xyz789",
    "isActive": true,
    "updatedAt": "2025-04-14T11:30:00.000Z"
  }
}`,
  },
  {
    id: "ep-delete",
    method: "DELETE",
    path: "/v1/qr/:id",
    summary: "Delete QR Code",
    description: "Permanently deletes a QR code and all its associated scan data. This action is irreversible. If you only want to stop a QR code from accepting scans without losing data, use the Update endpoint to set isActive: false instead.",
    responseFields: [
      { name: "success", type: "boolean", desc: "Always true on 200" },
      { name: "message", type: "string",  desc: "Confirmation message" },
    ],
    codes: [
      { code: "200", desc: "QR code permanently deleted" },
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
const result = await res.json()
// { success: true, message: 'QR code deleted' }`,
      python: `res = requests.delete(
    f'https://genxqr.com/v1/qr/{qr_id}',
    headers={'Authorization': f"Bearer {os.environ['GenXQR_API_KEY']}"}
)
# { 'success': True, 'message': 'QR code deleted' }`,
    },
    responseExample: `{
  "success": true,
  "message": "QR code deleted"
}`,
  },
  {
    id: "ep-analytics",
    method: "GET",
    path: "/v1/qr/:id/analytics",
    summary: "QR Analytics",
    description: "Returns scan analytics for a specific QR code. Includes aggregated totals, daily scan counts for the past 30 days, and breakdowns by country, device type, and browser.",
    queryParams: [
      { name: "period", type: "string", desc: "Time window. One of: 7d, 30d, 90d. Default: 30d" },
    ],
    responseFields: [
      { name: "totalScans",      type: "integer", desc: "All-time total scan count" },
      { name: "uniqueScans",     type: "integer", desc: "Deduplicated scan count (1 per device per 4h)" },
      { name: "todayScans",      type: "integer", desc: "Scans in the current UTC day" },
      { name: "timeSeries",      type: "array",   desc: "Daily scan counts for the requested period" },
      { name: "topCountries",    type: "array",   desc: "Top countries by scan count" },
      { name: "deviceBreakdown", type: "object",  desc: "Scan counts split by mobile / tablet / desktop" },
      { name: "browserBreakdown",type: "object",  desc: "Scan counts per browser" },
    ],
    codes: [
      { code: "200", desc: "Analytics returned" },
      { code: "401", desc: "Invalid or missing API key" },
      { code: "404", desc: "QR code not found" },
    ],
    examples: {
      curl: `curl "https://genxqr.com/v1/qr/clxxxxxxxxxxxxxxxx/analytics?period=30d" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      node: `const res = await fetch(
  \`https://genxqr.com/v1/qr/\${id}/analytics?period=30d\`,
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
    params={'period': '30d'},
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
    "todayScans": 18,
    "timeSeries": [
      { "date": "2025-04-13", "scans": 42 },
      { "date": "2025-04-14", "scans": 18 }
    ],
    "topCountries": [
      { "country": "IN", "scans": 830 },
      { "country": "US", "scans": 210 }
    ],
    "deviceBreakdown": {
      "mobile": 890,
      "desktop": 290,
      "tablet": 63
    },
    "browserBreakdown": {
      "Chrome": 720,
      "Safari": 380,
      "Firefox": 95,
      "Other": 48
    }
  }
}`,
  },
]

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
  { code: "400", title: "Bad Request",           desc: "The request body or query parameters failed validation. The response includes a list of validation errors." },
  { code: "401", title: "Unauthorized",          desc: "Missing or invalid API key. Ensure your Authorization header is set correctly." },
  { code: "403", title: "Forbidden",             desc: "Your current plan doesn't include this feature, or you've reached a plan limit. Upgrade to continue." },
  { code: "404", title: "Not Found",             desc: "The requested resource doesn't exist or belongs to another account." },
  { code: "409", title: "Conflict",              desc: "A resource with the same unique identifier already exists." },
  { code: "422", title: "Unprocessable Entity",  desc: "The request is well-formed but the semantic content is invalid for the operation." },
  { code: "429", title: "Too Many Requests",     desc: "You have exceeded the rate limit. The response includes a Retry-After header with the wait time in seconds." },
  { code: "500", title: "Internal Server Error", desc: "An unexpected error occurred on our side. These are automatically logged and monitored. Please retry after a moment." },
]

// ─── Webhook events ───────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  {
    event: "qr.scanned",
    desc: "Fired when a QR code is scanned. Deduplicated: at most one event per device per 4 hours.",
    payload: `{
  "event": "qr.scanned",
  "qrId": "clxxxxxxxxxxxxxxxx",
  "slug": "abc123",
  "scannedAt": "2025-04-14T10:30:00.000Z",
  "country": "IN",
  "city": "Mumbai",
  "device": "mobile",
  "browser": "Chrome",
  "os": "Android"
}`,
  },
  {
    event: "qr.created",
    desc: "Fired when a new QR code is created, whether via the dashboard or the API.",
    payload: `{
  "event": "qr.created",
  "qrId": "clxxxxxxxxxxxxxxxx",
  "name": "Product Launch",
  "type": "URL",
  "slug": "xyz789",
  "createdAt": "2025-04-14T10:00:00.000Z"
}`,
  },
  {
    event: "qr.updated",
    desc: "Fired when a QR code's content, name, or settings are changed.",
    payload: `{
  "event": "qr.updated",
  "qrId": "clxxxxxxxxxxxxxxxx",
  "updatedAt": "2025-04-14T11:00:00.000Z"
}`,
  },
  {
    event: "qr.deleted",
    desc: "Fired when a QR code is permanently deleted.",
    payload: `{
  "event": "qr.deleted",
  "qrId": "clxxxxxxxxxxxxxxxx",
  "deletedAt": "2025-04-14T12:00:00.000Z"
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
      </p>
      <CodeBlock lang="bash" code={`# Every request must include this header
curl https://genxqr.com/v1/qr \\
  -H "Authorization: Bearer nxqr_••••••••••••••••••••••••••••••••"`} />
      <div className="mt-4 p-4 border border-amber-500/20 bg-amber-500/10 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-700 dark:text-amber-300 text-xs font-semibold mb-1">Keep your key secret</p>
            <p className="text-ink-soft text-xs leading-relaxed">
              API keys carry full account access. Store them in environment variables (<code className="text-amber-700 dark:text-amber-300">GenXQR_API_KEY</code>), never in client-side code or source files.
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
        Rate limits are applied per API key. When you exceed the limit, the API responds with <code className="text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1 rounded">HTTP 429</code> and a <code className="text-ink-soft bg-paper-pure border border-line px-1 rounded">Retry-After</code> header telling you how many seconds to wait.
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
              ["Sustained rate",  "200 req / min",   "Applies globally across all endpoints"],
              ["Burst window",    "50 req / 5 sec",  "Short bursts beyond the sustained rate"],
              ["Retry-After",     "Seconds to wait", "Included in the 429 response header"],
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
  "error": "Too many requests, please try again later."
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
        Errors always return a JSON body with <code className="text-accent bg-accent-soft px-1 rounded">success: false</code> and a human-readable <code className="text-accent bg-accent-soft px-1 rounded">error</code> field. Validation errors additionally include an <code className="text-accent bg-accent-soft px-1 rounded">errors</code> array.
      </p>
      <CodeBlock lang="json" code={`// Standard error response
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    { "field": "type", "message": "Invalid QR type" },
    { "field": "content.data.url", "message": "URL is required" }
  ]
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
        All list endpoints use cursor-free page-based pagination. Pass <code className="text-accent bg-accent-soft px-1 rounded">page</code> and <code className="text-accent bg-accent-soft px-1 rounded">limit</code> as query parameters. Every list response includes a <code className="text-accent bg-accent-soft px-1 rounded">meta</code> object.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <CodeBlock lang="bash" code={`# Request page 3, 50 items per page
curl "https://genxqr.com/v1/qr?page=3&limit=50" \\
  -H "Authorization: Bearer YOUR_API_KEY"`} />
        <CodeBlock lang="json" code={`// meta object in every list response
"meta": {
  "page": 3,
  "limit": 50,
  "total": 142,
  "totalPages": 3
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
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-950 font-mono text-xs space-y-1.5 mb-4">
          <p><span className="text-violet-300">POST</span> <span className="text-zinc-300">https://your-server.com/webhook</span></p>
          <p><span className="text-zinc-500">Content-Type:</span> <span className="text-zinc-300">application/json</span></p>
          <p><span className="text-zinc-500">X-GenXQR-Signature:</span> <span className="text-zinc-300">sha256=&lt;HMAC-SHA256&gt;</span></p>
          <p><span className="text-zinc-500">X-GenXQR-Event:</span> <span className="text-zinc-300">qr.scanned</span></p>
        </div>
        <div className="mt-4 border-t border-line" />
      </section>

      <section id="webhooks-events" className="scroll-mt-32 mb-16">
        <h2 className="text-ink font-display font-bold text-2xl mb-4">Events & Payloads</h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-6">
          Subscribe to any combination of the events below when creating a webhook.
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
  const sig      = req.headers['x-GenXQR-signature']
  const body     = req.body   // raw Buffer — do NOT parse before verifying
  const secret   = process.env.GenXQR_WEBHOOK_SECRET

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
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
from fastapi import Request, HTTPException

@app.post("/webhook")
async def handle_webhook(request: Request):
    body   = await request.body()
    sig    = request.headers.get("x-GenXQR-signature", "")
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
    "ep-delete":    <Trash2 size={12} />,
    "ep-analytics": <BarChart2 size={12} />,
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

          {ENDPOINTS.filter((ep) => ep.id !== "ep-analytics").map((ep) => (
            <EndpointSection key={ep.id} ep={ep} lang={lang} />
          ))}

          <div className="mb-8">
            <h2 className="text-ink font-display font-bold text-2xl mb-1">Analytics</h2>
            <p className="text-ink-faint text-sm mb-8">Retrieve scan analytics for your QR codes.</p>
          </div>

          {ENDPOINTS.filter((ep) => ep.id === "ep-analytics").map((ep) => (
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
                { type: "WIFI", schema: `{ "data": { "ssid": "My Network", "password": "secret", "encryption": "WPA" } }` },
                { type: "WHATSAPP", schema: `{ "data": { "phone": "+919876543210", "message": "Hello!" } }` },
                { type: "INSTAGRAM", schema: `{ "data": { "username": "yourhandle" } }` },
                { type: "VCARD", schema: `{ "data": { "firstName": "Raj", "lastName": "Sharma", "phone": "+91...", "email": "raj@...", "company": "Acme" } }` },
                { type: "FACEBOOK", schema: `{ "data": { "pageUrl": "https://facebook.com/yourpage" } }` },
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
