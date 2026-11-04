import { ExternalLink } from "lucide-react"
import {
  INTEGRATION_ACTIONS,
  INTEGRATION_NOTES,
  INTEGRATION_REQUIREMENTS,
  INTEGRATION_TRIGGERS,
  MAKE_INVITE_URL,
  MAKE_STEPS,
  N8N_STEPS,
  ZAPIER_INVITE_URL,
  ZAPIER_STEPS,
} from "@/lib/integrations"

/**
 * "Zapier, Make & n8n" tab of the API Keys and Webhooks guides. Content lives in
 * lib/integrations.ts so these guides, the API docs and the FAQ say the same.
 */

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((text, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
          <p className="text-zinc-400 text-xs leading-relaxed">{text}</p>
        </li>
      ))}
    </ol>
  )
}

function Invite({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300">
      {label} <ExternalLink size={12} />
    </a>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-zinc-900 dark:text-white font-semibold">{title}</p>
      {children}
    </div>
  )
}

export function IntegrationsGuide() {
  return (
    <>
      <p className="text-zinc-400 leading-relaxed">
        Connect GenXQR to thousands of apps without code: log scans to a spreadsheet, alert your team in Slack, or update a code's destination from your CRM.
      </p>

      <div>
        <p className="text-zinc-900 dark:text-white font-semibold mb-2">You need</p>
        <ul className="space-y-1">
          {INTEGRATION_REQUIREMENTS.map((r) => <li key={r} className="text-zinc-400 text-xs leading-relaxed">• {r}</li>)}
        </ul>
      </div>

      <Block title="Zapier">
        <Invite href={ZAPIER_INVITE_URL} label="Add GenXQR to Zapier (invite link)" />
        <Steps steps={ZAPIER_STEPS} />
      </Block>

      <Block title="Make">
        {MAKE_INVITE_URL && <Invite href={MAKE_INVITE_URL} label="Add GenXQR to Make (invite link)" />}
        <Steps steps={MAKE_STEPS} />
      </Block>

      <Block title="n8n">
        <p className="text-zinc-500 text-xs">No install needed — n8n's built-in Webhook and HTTP Request nodes work with GenXQR.</p>
        <Steps steps={N8N_STEPS} />
      </Block>

      <div className="grid gap-3 sm:grid-cols-2">
        <Block title="Triggers">
          <ul className="space-y-1.5">
            {INTEGRATION_TRIGGERS.map((t) => (
              <li key={t.event} className="text-xs text-zinc-400 leading-relaxed">
                <span className="text-zinc-900 dark:text-zinc-200 font-medium">{t.zapier}</span>
                <span className="text-zinc-500"> · Make: {t.make}</span> — {t.desc}
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Actions (Zapier & Make)">
          <ul className="space-y-1.5">
            {INTEGRATION_ACTIONS.map((a) => (
              <li key={a.name} className="text-xs text-zinc-400 leading-relaxed">
                <span className="text-zinc-900 dark:text-zinc-200 font-medium">{a.name}</span> — {a.desc}
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <div>
        <p className="text-zinc-900 dark:text-white font-semibold mb-2">Good to know</p>
        <ul className="space-y-1">
          {INTEGRATION_NOTES.map((n) => <li key={n} className="text-zinc-400 text-xs leading-relaxed">• {n}</li>)}
        </ul>
        <p className="text-zinc-500 text-xs mt-2">
          Full field list and payloads: <a href="/api-docs#integrations" className="text-violet-400 hover:text-violet-300">API docs → Integrations</a>.
        </p>
      </div>
    </>
  )
}
