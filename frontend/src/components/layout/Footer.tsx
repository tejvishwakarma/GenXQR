import { Link } from "react-router-dom"
import { QrCode, Twitter, Github, Linkedin } from "lucide-react"

const footerLinks = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Use Cases", href: "/use-cases" },
    { label: "API Docs", href: "/api-docs" },
    { label: "Changelog", href: "/changelog" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "FAQ", href: "/faq" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookie-policy" },
    { label: "GDPR", href: "/gdpr" },
  ],
  Tools: [
    { label: "Free QR Generator", href: "/generate" },
    { label: "URL QR Code", href: "/generate/url" },
    { label: "WiFi QR Code", href: "/generate/wifi" },
    { label: "WhatsApp QR Code", href: "/generate/whatsapp" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950/80 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Top */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(124,58,237,0.3)]">
                <QrCode className="w-4.5 h-4.5 text-white" size={18} />
              </div>
              <span className="text-white font-bold text-lg">
                Nexus<span className="gradient-text">QR</span>
              </span>
            </Link>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-xs mb-6">
              The most powerful QR code platform for businesses. Create, track, and optimize your QR codes at scale.
            </p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                <Twitter size={16} />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                <Github size={16} />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                <Linkedin size={16} />
              </a>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <h4 className="text-white font-semibold text-sm mb-4">{section}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-zinc-400 hover:text-white text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="border-t border-zinc-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-zinc-500 text-sm">
            © 2026 GenXQR. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-zinc-500 text-xs">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
