import { Outlet } from "react-router-dom"
import { Navbar } from "./Navbar"
import { Footer } from "./Footer"

export function MarketingLayout() {
  return (
    <div className="dark min-h-screen flex flex-col bg-zinc-950">
      <Navbar />
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
