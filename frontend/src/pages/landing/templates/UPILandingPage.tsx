import { useState } from "react"
import type { PublicQRFile } from "@/lib/api"
import { copyText } from "@/lib/clipboard"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

/**
 * iPhone has no app chooser: a upi:// link opens whichever app claimed the
 * scheme — often WhatsApp. So on iOS each big UPI app gets its own button, with
 * its own link (formats from Razorpay's UPI intent docs for iOS), and upi://
 * stays as "Other UPI app". Safari cannot tell which apps are installed; a
 * button for a missing app just does nothing.
 */
const IOS_APPS = [
  { name: "Google Pay", prefix: "tez://upi/pay?" },
  { name: "PhonePe", prefix: "phonepe://pay?" },
  { name: "Paytm", prefix: "paytmmp://upi/pay?" },
]

/** iPhone, iPod, and iPad — including iPadOS, which reports itself as a Mac with touch. */
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

/**
 * A UPI payment page (type UPI). The printed code links here, so the Pay button
 * hands the details to the phone's UPI app with a upi://pay link (NPCI's deep
 * link). Android offers every installed UPI app; iPhone gets a button per app
 * (IOS_APPS). The UPI ID can also be copied and paid by hand.
 */
export default function UPILandingPage({ content }: Props) {
  const upiId = typeof content.upiId === "string" ? content.upiId : ""
  const payeeName = typeof content.payeeName === "string" ? content.payeeName : ""
  const amount = typeof content.amount === "string" ? content.amount : ""
  const note = typeof content.note === "string" ? content.note : ""
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle")

  // The UPI ID goes in as written (its @ unescaped): some UPI apps don't decode %40.
  const query = `pa=${upiId}&pn=${encodeURIComponent(payeeName)}`
    + (amount ? `&am=${amount}` : "") + "&cu=INR" + (note ? `&tn=${encodeURIComponent(note)}` : "")
  const payLink = `upi://pay?${query}`
  const [ios] = useState(isIOS)

  const copyId = () => {
    void copyText(upiId).then((ok) => {
      setCopy(ok ? "copied" : "failed")
      if (ok) setTimeout(() => setCopy("idle"), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4 text-4xl font-bold text-emerald-600" aria-hidden>
            ₹
          </div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Pay</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{payeeName || "UPI payment"}</h1>
          {amount && <p className="text-4xl font-black text-gray-900 mt-3">₹{Number(amount).toLocaleString("en-IN", { minimumFractionDigits: amount.endsWith(".00") ? 0 : 2 })}</p>}
          {note && <p className="text-gray-500 text-sm mt-2">{note}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">UPI ID</p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-bold text-gray-900 break-all select-all">{upiId}</p>
              <button
                type="button"
                onClick={copyId}
                aria-live="polite"
                className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-xs font-medium text-gray-600"
              >
                {copy === "copied" ? "Copied" : "Copy"}
              </button>
            </div>
            {copy === "failed" && (
              <p className="text-xs text-amber-600 mt-2">This browser blocked copying. Press and hold the UPI ID to copy it.</p>
            )}
          </div>
          {ios ? (
            <div className="p-5 space-y-2.5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Pay with</p>
              {IOS_APPS.map((app) => (
                <a
                  key={app.name}
                  href={`${app.prefix}${query}`}
                  className="block w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 transition-colors"
                >
                  {app.name}
                </a>
              ))}
              <a
                href={payLink}
                className="block w-full text-center rounded-xl border border-emerald-600 text-emerald-700 font-semibold py-3 transition-colors hover:bg-emerald-50"
              >
                Other UPI app
              </a>
              <p className="text-xs text-gray-400 text-center pt-1 leading-relaxed">
                Tap the app you use. If it doesn't open, copy the UPI ID above and pay it from your UPI app.
              </p>
            </div>
          ) : (
            <div className="p-5">
              <a
                href={payLink}
                className="block w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 transition-colors"
              >
                {amount ? "Pay with UPI app" : "Open UPI app to pay"}
              </a>
              <p className="text-xs text-gray-400 text-center mt-3 leading-relaxed">
                Opens Google Pay, PhonePe, Paytm, BHIM or your bank's UPI app. If nothing opens, copy the UPI ID and pay it from your UPI app.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
