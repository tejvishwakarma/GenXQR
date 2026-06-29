import { useState } from "react"
import type { PublicQRFile } from "@/lib/api"

interface MenuItem {
  name: string
  description?: string
  price: string
  image?: string
  allergens?: string[]
  isVeg?: boolean
}

interface MenuSection {
  category: string
  items: MenuItem[]
}

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function MenuLandingPage({ name, content }: Props) {
  const restaurantName = (content.restaurantName as string) || name
  const description = content.description as string | undefined
  const currency = (content.currency as string) || "₹"
  const sections = (content.sections as MenuSection[]) ?? []
  const activeCategory = sections[0]?.category ?? null
  const [activeTab, setActiveTab] = useState<string | null>(activeCategory)
  const accent = "#e85d04"

  const currentSection = sections.find((s) => s.category === activeTab) ?? sections[0]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ background: accent }}>
            {restaurantName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">{restaurantName}</h1>
            {description && <p className="text-xs text-gray-500 truncate max-w-[200px]">{description}</p>}
          </div>
        </div>

        {/* Category tabs */}
        {sections.length > 1 && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {sections.map((s) => (
              <button
                key={s.category}
                onClick={() => setActiveTab(s.category)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={activeTab === s.category
                  ? { background: accent, color: "white" }
                  : { background: "#f3f4f6", color: "#6b7280" }
                }
              >
                {s.category}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Menu items */}
      <div className="px-4 py-4 space-y-3 pb-20">
        {currentSection?.items.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {item.isVeg !== undefined && (
                  <span
                    className="w-4 h-4 flex-shrink-0 rounded-sm border-2 flex items-center justify-center text-[8px]"
                    style={{ borderColor: item.isVeg ? "#16a34a" : "#dc2626" }}
                  >
                    <span style={{ color: item.isVeg ? "#16a34a" : "#dc2626" }}>●</span>
                  </span>
                )}
                <span className="font-semibold text-gray-900 text-sm">{item.name}</span>
              </div>
              {item.description && (
                <p className="text-xs text-gray-500 mb-2 leading-relaxed">{item.description}</p>
              )}
              {item.allergens && item.allergens.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.allergens.map((a) => (
                    <span key={a} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded-full border border-amber-200">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col items-end justify-between">
              <span className="font-bold text-gray-900" style={{ color: accent }}>
                {currency}{item.price}
              </span>
            </div>
          </div>
        ))}

        {(!currentSection || currentSection.items.length === 0) && (
          <p className="text-center text-gray-400 py-16">Menu items coming soon</p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 text-center py-2 bg-white/80 backdrop-blur-sm text-xs text-gray-400 border-t">
        Powered by GenXQR
      </div>
    </div>
  )
}
