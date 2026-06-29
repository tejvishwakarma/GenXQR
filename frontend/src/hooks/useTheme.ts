import { useState, useEffect } from "react"

type Theme = "light" | "dark"

const DASHBOARD_THEME_KEY = "dashboard-theme"

function getDashboardTheme(): Theme {
  const stored = localStorage.getItem(DASHBOARD_THEME_KEY) as Theme | null
  if (stored === "light" || stored === "dark") return stored
  return "dark"
}

/**
 * Dashboard-scoped theme hook.
 * Syncs the `dark` class to <html> so ALL Tailwind dark: variants (including
 * Radix portals and fixed-positioned elements) respond correctly.
 * Cleans up on unmount so marketing pages are unaffected.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getDashboardTheme)

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
    return () => {
      // Remove when DashboardLayout unmounts (navigating to marketing pages)
      document.documentElement.classList.remove("dark")
    }
  }, [theme])

  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark"
      localStorage.setItem(DASHBOARD_THEME_KEY, next)
      return next
    })

  return { theme, toggleTheme }
}
