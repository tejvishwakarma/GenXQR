import { useState } from "react"
import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function WiFiLandingPage({ content }: Props) {
  const ssid = content.ssid as string | undefined
  const password = content.password as string | undefined
  const security = (content.security as string) || "WPA"
  const [copied, setCopied] = useState<"ssid" | "password" | null>(null)

  const copy = (text: string, field: "ssid" | "password") => {
    void navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Join WiFi</h1>
          <p className="text-gray-500 text-sm mt-1">Tap to copy the details below</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Network name */}
          <div className="p-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Network Name (SSID)</p>
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-gray-900">{ssid ?? "N/A"}</p>
              {ssid && (
                <button
                  onClick={() => copy(ssid, "ssid")}
                  className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                >
                  {copied === "ssid" ? (
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Password */}
          {security !== "nopass" && (
            <div className="p-5 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Password</p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-mono font-bold text-gray-900">{password ?? "—"}</p>
                {password && (
                  <button
                    onClick={() => copy(password, "password")}
                    className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                  >
                    {copied === "password" ? (
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Security type */}
          <div className="p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Security</p>
            <p className="text-sm font-medium text-gray-700">{security === "nopass" ? "Open (No Password)" : security}</p>
          </div>
        </div>

        <p className="mt-6 text-xs text-center text-gray-400">Powered by GenXQR</p>
      </div>
    </div>
  )
}
