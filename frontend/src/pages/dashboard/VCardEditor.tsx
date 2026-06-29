/**
 * Advanced vCard editor — mirrors the feature-set of professional QR builders:
 * profile image, multiple phones/emails/websites, location, company + summary,
 * and 30+ social-network links with icon grid.
 */

import { useState, useRef, useCallback } from "react"
import { Plus, Trash2, Loader2, User, Phone, Globe, MapPin, Building2, ChevronDown, ChevronUp } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { uploadFile } from "@/lib/api"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContactEntry { value: string; label: string }

export interface VCardData {
  profileImage: string | null
  firstName: string
  lastName: string
  phones: ContactEntry[]
  emails: ContactEntry[]
  websites: ContactEntry[]
  address: string
  city: string
  state: string
  country: string
  zip: string
  company: string
  profession: string
  summary: string
  socials: Record<string, string>
}

export const DEFAULT_VCARD_DATA: VCardData = {
  profileImage: null,
  firstName: "",
  lastName: "",
  phones: [{ value: "", label: "mobile" }],
  emails: [{ value: "", label: "work" }],
  websites: [{ value: "", label: "website" }],
  address: "",
  city: "",
  state: "",
  country: "",
  zip: "",
  company: "",
  profession: "",
  summary: "",
  socials: {},
}

// ─── Social network catalogue ─────────────────────────────────────────────────

interface SocialNetwork {
  id: string
  label: string
  placeholder: string
  color: string
  icon: React.ReactNode
}

/** Renders a circle badge with the brand color + white icon SVG inside */
function SocialIcon({ net, size = 20 }: { net: SocialNetwork; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl overflow-hidden"
      style={{ width: size, height: size, background: net.color, flexShrink: 0 }}
    >
      {net.icon}
    </span>
  )
}

const SOCIAL_NETWORKS: SocialNetwork[] = [
  {
    id: "website", label: "Website", placeholder: "https://yoursite.com", color: "#6366f1",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.22.2-1.8L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>,
  },
  {
    id: "facebook", label: "Facebook", placeholder: "https://facebook.com/you", color: "#1877f2",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
  {
    id: "instagram", label: "Instagram", placeholder: "https://instagram.com/you", color: "#e1306c",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162S8.597 18.163 12 18.163s6.162-2.759 6.162-6.162S15.403 5.838 12 5.838zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
  },
  {
    id: "twitter", label: "X / Twitter", placeholder: "https://x.com/you", color: "#000000",
    icon: <svg viewBox="0 0 24 24" fill="white" width="11" height="11"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/you", color: "#0a66c2",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  },
  {
    id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@you", color: "#ff0000",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>,
  },
  {
    id: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@you", color: "#010101",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>,
  },
  {
    id: "snapchat", label: "Snapchat", placeholder: "https://snapchat.com/add/you", color: "#FFFC00",
    icon: <svg viewBox="0 0 24 24" width="13" height="13"><path fill="#000" d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z"/></svg>,
  },
  {
    id: "whatsapp", label: "WhatsApp", placeholder: "+1 555 000 0000", color: "#25d366",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>,
  },
  {
    id: "telegram", label: "Telegram", placeholder: "https://t.me/you", color: "#26a5e4",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
  },
  {
    id: "pinterest", label: "Pinterest", placeholder: "https://pinterest.com/you", color: "#e60023",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>,
  },
  {
    id: "skype", label: "Skype", placeholder: "live:username", color: "#00aff0",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12.069 18.874c-4.023 0-5.82-1.979-5.82-3.464 0-.765.561-1.296 1.333-1.296 1.723 0 1.273 2.477 4.487 2.477 1.641 0 2.55-.895 2.55-1.811 0-.551-.269-1.16-1.354-1.429l-3.576-.895c-2.88-.724-3.403-2.286-3.403-3.751 0-3.047 2.861-4.191 5.549-4.191 2.471 0 5.393 1.373 5.393 3.199 0 .784-.688 1.24-1.453 1.24-1.469 0-1.198-2.037-4.164-2.037-1.469 0-2.292.664-2.292 1.617s1.153 1.258 2.157 1.487l2.637.587c2.891.649 3.624 2.346 3.624 3.944 0 2.476-1.902 4.324-5.668 4.324m11.084-4.882l-.029.135-.044-.24a6.832 6.832 0 0 0 .19-1.570 6.958 6.958 0 0 0-6.948-6.968 6.886 6.886 0 0 0-1.588.185l-.238-.045.137-.029A6.408 6.408 0 0 0 12.069 5C8.727 5 6 7.787 6 11.217c0 .693.121 1.367.329 2.001l-.027.145.039-.189a7.01 7.01 0 0 0-.167 1.508A6.955 6.955 0 0 0 13.122 21.6c.521 0 1.03-.056 1.521-.16l.194.038-.193-.026A6.408 6.408 0 0 0 17.869 22C21.211 22 24 19.217 24 15.784c0-.639-.095-1.26-.271-1.849l.035.178z"/></svg>,
  },
  {
    id: "github", label: "GitHub", placeholder: "https://github.com/you", color: "#24292f",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>,
  },
  {
    id: "dribbble", label: "Dribbble", placeholder: "https://dribbble.com/you", color: "#ea4c89",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.017-8.04 6.37 1.73 1.35 3.92 2.166 6.29 2.166 1.42 0 2.77-.29 4.006-.786zm-11.62-2.073c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.74C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.045 2.634 6.855zm-2.42-8.955c.46.008 4.683.026 9.477-1.248-1.698-3.018-3.53-5.558-3.8-5.928-2.868 1.35-5.01 3.99-5.676 7.176zM9.6 2.052c.282.38 2.145 2.914 3.822 6 3.645-1.365 5.19-3.44 5.373-3.702-1.81-1.61-4.19-2.586-6.795-2.586-.823 0-1.622.108-2.4.285zm10.335 3.483c-.218.29-1.935 2.493-5.724 4.04.24.49.47.985.68 1.486.08.18.15.36.22.53 3.41-.43 6.8.26 7.14.33-.02-2.42-.88-4.64-2.31-6.38z"/></svg>,
  },
  {
    id: "behance", label: "Behance", placeholder: "https://behance.net/you", color: "#1769ff",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M6.938 4.503c.702 0 1.34.06 1.92.188.577.13 1.07.33 1.485.61.41.28.733.65.96 1.12.225.47.34 1.05.34 1.73 0 .74-.17 1.36-.507 1.86-.338.5-.837.9-1.502 1.22.906.26 1.576.72 2.022 1.37.448.66.665 1.45.665 2.36 0 .75-.13 1.39-.41 1.93-.28.55-.67 1-1.16 1.35-.48.348-1.05.6-1.69.755-.64.152-1.32.23-2.03.23H0V4.51l6.938-.007zm-.588 5.51c.577 0 1.05-.136 1.412-.404.358-.27.538-.7.538-1.29 0-.33-.06-.607-.175-.822-.116-.216-.278-.39-.49-.516-.21-.125-.455-.215-.728-.27-.27-.053-.558-.08-.86-.08H3.53v3.382h2.82zm.188 5.694c.34 0 .65-.03.94-.093.29-.06.543-.165.76-.31.217-.144.39-.344.516-.594.124-.25.19-.57.19-.96 0-.76-.21-1.3-.625-1.62-.42-.316-.975-.474-1.67-.474H3.53v4.05h3.008zm9.24-.944c.34.33.83.497 1.47.497.46 0 .855-.115 1.19-.342.336-.23.538-.47.61-.72h2.44c-.39 1.21-1 2.07-1.82 2.59-.82.52-1.81.77-2.97.77-.81 0-1.54-.13-2.18-.39-.64-.26-1.18-.63-1.63-1.1-.44-.47-.78-1.03-1.01-1.67-.23-.64-.35-1.34-.35-2.1 0-.74.12-1.42.37-2.05.25-.63.6-1.18 1.05-1.64.45-.46.99-.82 1.63-1.08.64-.26 1.36-.39 2.15-.39.88 0 1.65.17 2.31.51.66.34 1.2.8 1.63 1.38.43.58.73 1.24.91 1.98.18.74.24 1.52.17 2.32h-7.25c0 .7.22 1.27.56 1.62zM16 10.13c-.27-.3-.72-.45-1.32-.45-.38 0-.7.06-.97.2-.27.13-.49.3-.66.5-.17.2-.29.42-.36.65-.07.23-.11.46-.12.67h3.94c-.1-.66-.32-1.27-.51-1.57zm-3.24-3.77h5.12V7.5h-5.12V6.36z"/></svg>,
  },
  {
    id: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/you", color: "#1db954",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>,
  },
  {
    id: "soundcloud", label: "SoundCloud", placeholder: "https://soundcloud.com/you", color: "#ff5500",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M1.175 12.225c-.15 0-.254.097-.27.256l-.359 2.944.359 2.972c.016.163.12.256.27.256.149 0 .254-.098.27-.256l.39-2.972-.39-2.944c-.016-.16-.12-.256-.27-.256zm1.827-.524c-.148 0-.253.097-.269.254l-.45 3.468.45 3.511c.016.157.12.254.269.254.15 0 .254-.097.27-.254l.509-3.511-.509-3.468c-.016-.157-.12-.254-.27-.254zm1.826-.045c-.165 0-.284.108-.299.275l-.39 3.513.39 3.555c.015.167.134.275.299.275.164 0 .283-.108.299-.275l.449-3.555-.449-3.513c-.016-.167-.135-.275-.299-.275zm1.83.27c-.18 0-.314.12-.329.3l-.33 3.243.33 3.282c.015.18.15.3.33.3.178 0 .312-.12.328-.3l.374-3.282-.374-3.243c-.016-.18-.15-.3-.328-.3zm1.827-.748c-.194 0-.343.135-.358.33l-.3 3.99.3 4.035c.015.195.164.33.358.33.193 0 .342-.135.358-.33l.339-4.035-.339-3.99c-.016-.195-.165-.33-.358-.33zm1.828 1.064c-.21 0-.373.15-.388.36l-.269 2.926.269 2.962c.015.21.178.36.388.36.209 0 .372-.15.387-.36l.306-2.962-.306-2.926c-.015-.21-.179-.36-.387-.36zm1.826-3.81c-.225 0-.398.165-.413.39L11.55 12c0 .225.188.39.413.39.224 0 .397-.165.413-.39l.285-3.228-.285-3.278c-.016-.225-.19-.39-.413-.39zm1.827 1.605c-.24 0-.428.18-.442.42l-.255 3.233.255 3.27c.014.24.202.42.442.42.239 0 .427-.18.442-.42l.289-3.27-.289-3.233c-.015-.24-.203-.42-.442-.42zm1.827-1.2c-.254 0-.457.194-.47.45l-.226 4.43.226 4.47c.013.255.216.45.47.45.253 0 .456-.195.47-.45l.257-4.47-.257-4.43c-.014-.255-.217-.45-.47-.45zm1.827 1.186c-.27 0-.487.207-.5.478l-.196 3.244.196 3.276c.013.27.23.478.5.478.268 0 .485-.208.5-.478l.222-3.276-.222-3.244c-.015-.27-.232-.478-.5-.478zm1.826-1.2c-.285 0-.515.22-.529.508l-.166 4.44.166 4.476c.014.288.244.508.529.508.284 0 .514-.22.529-.508l.188-4.476-.188-4.44c-.015-.288-.245-.508-.529-.508zm1.828.66c-.3 0-.543.234-.556.536l-.136 3.78.136 3.813c.013.3.256.535.556.535.3 0 .543-.234.556-.535l.154-3.812-.154-3.78c-.013-.302-.256-.537-.556-.537zm1.816-.54c-.314 0-.568.246-.58.56l-.106 4.32.106 4.352c.012.315.266.56.58.56.312 0 .566-.245.58-.56l.12-4.352-.12-4.32c-.014-.314-.268-.56-.58-.56zM24 11.4c0-1.71-1.39-3.09-3.09-3.09-.465 0-.906.107-1.296.3-.265-3.27-2.985-5.82-6.33-5.82-1.335 0-2.565.42-3.555 1.125a.37.37 0 0 0-.15.3v11.385c0 .165.12.3.285.315H20.91C22.608 15.915 24 14.325 24 11.4z"/></svg>,
  },
  {
    id: "vimeo", label: "Vimeo", placeholder: "https://vimeo.com/you", color: "#1ab7ea",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.48 4.807z"/></svg>,
  },
  {
    id: "reddit", label: "Reddit", placeholder: "https://reddit.com/u/you", color: "#ff4500",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>,
  },
  {
    id: "medium", label: "Medium", placeholder: "https://medium.com/@you", color: "#000000",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/></svg>,
  },
  {
    id: "twitch", label: "Twitch", placeholder: "https://twitch.tv/you", color: "#9146ff",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>,
  },
  {
    id: "discord", label: "Discord", placeholder: "https://discord.gg/invite", color: "#5865f2",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/></svg>,
  },
  {
    id: "xing", label: "Xing", placeholder: "https://xing.com/profile/you", color: "#026466",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M18.188 0c-.517 0-.741.325-.927.66 0 0-7.455 13.224-7.702 13.657.015.024 4.919 9.023 4.919 9.023.17.308.436.66.967.66h3.454c.211 0 .375-.078.463-.22.089-.151.089-.346-.009-.536l-4.879-8.916c-.004-.006-.004-.016 0-.022L22.139.756c.095-.191.097-.387.006-.535C22.056.078 21.894 0 21.686 0h-3.498zM3.648 4.74c-.211 0-.385.074-.473.216-.09.149-.078.339.02.531l2.34 4.05c.004.01.004.016 0 .021L1.86 16.051c-.099.188-.093.381 0 .529.085.142.239.234.45.234h3.461c.518 0 .766-.348.945-.667l3.734-6.609-2.378-4.155c-.172-.315-.434-.659-.962-.659H3.648v.016z"/></svg>,
  },
  {
    id: "glassdoor", label: "Glassdoor", placeholder: "https://glassdoor.com/you", color: "#0caa41",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M22.26 14.63H11.6v1.95h8.18c-.67 2.03-2.65 3.5-5.71 3.5-3.98 0-6.94-3.34-6.94-7.08 0-3.77 2.96-7.09 6.94-7.09 1.86 0 3.53.65 4.81 1.71l1.43-1.43A10.14 10.14 0 0 0 14.07 4C9.13 4 5.13 7.97 5.13 13s3.97 9 8.94 9c6.89 0 8.45-5.6 8.27-7.37H22.26zM12.49 2h-1.93v7.51h1.93V2z"/></svg>,
  },
  {
    id: "calendly", label: "Calendly", placeholder: "https://calendly.com/you", color: "#006bff",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zm0-13H5V6h14v1zM7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2z"/></svg>,
  },
  {
    id: "vk", label: "VK", placeholder: "https://vk.com/you", color: "#0077ff",
    icon: <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.677-1.253.677-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.27-1.422 2.168-3.607 2.168-3.607.119-.254.322-.491.762-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .779.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.474-.085.712-.576.712z"/></svg>,
  },
]

const PHONE_LABELS  = ["mobile", "home", "work", "fax", "other"]
const EMAIL_LABELS  = ["work", "personal", "other"]
const WEBSITE_LABELS = ["website", "portfolio", "blog", "shop", "other"]

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
            {icon}
          </div>
          <div>
            <p className="text-zinc-800 dark:text-zinc-200 text-sm font-medium">{title}</p>
            <p className="text-zinc-500 text-xs">{subtitle}</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>}
    </div>
  )
}

function MultiEntry({
  entries,
  labels,
  placeholder,
  onAdd,
  onChange,
  onRemove,
}: {
  entries: ContactEntry[]
  labels: string[]
  placeholder: string
  onAdd: () => void
  onChange: (idx: number, field: "value" | "label", val: string) => void
  onRemove: (idx: number) => void
}) {
  return (
    <div className="space-y-2">
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <select
            value={entry.label}
            onChange={(e) => onChange(idx, "label", e.target.value)}
            className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs rounded-lg px-2 py-2.5 focus:ring-1 focus:ring-violet-500 outline-none capitalize min-w-[90px]"
          >
            {labels.map((l) => (
              <option key={l} value={l} className="capitalize">{l}</option>
            ))}
          </select>
          <Input
            value={entry.value}
            onChange={(e) => onChange(idx, "value", e.target.value)}
            placeholder={placeholder}
            className="flex-1 text-sm"
          />
          {entries.length > 1 && (
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="text-zinc-600 hover:text-red-400 transition-colors p-1 shrink-0"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 text-violet-400 hover:text-violet-300 text-xs font-medium transition-colors"
      >
        <Plus size={14} /> Add {entries.length > 0 ? "another" : ""}
      </button>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface VCardEditorProps {
  value: VCardData
  onChange: (data: VCardData) => void
}

export function VCardEditor({ value, onChange }: VCardEditorProps) {
  const imgInputRef = useRef<HTMLInputElement>(null)
  const [isImgUploading, setIsImgUploading] = useState(false)
  const [activeSocial, setActiveSocial] = useState<string | null>(null)

  const set = useCallback(
    (updates: Partial<VCardData>) => onChange({ ...value, ...updates }),
    [value, onChange],
  )

  // ─── Profile image ─────────────────────────────────────────────────────────
  const handleImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImgUploading(true)
    try {
      const info = await uploadFile(file, "image")
      set({ profileImage: info.tempUrl })
    } finally {
      setIsImgUploading(false)
      if (imgInputRef.current) imgInputRef.current.value = ""
    }
  }, [set])

  // ─── Multi-entry helpers ───────────────────────────────────────────────────
  function addEntry(field: "phones" | "emails" | "websites", defaultLabel: string) {
    set({ [field]: [...value[field], { value: "", label: defaultLabel }] })
  }
  function updateEntry(field: "phones" | "emails" | "websites", idx: number, key: "value" | "label", val: string) {
    const arr = value[field].map((e, i) => i === idx ? { ...e, [key]: val } : e)
    set({ [field]: arr })
  }
  function removeEntry(field: "phones" | "emails" | "websites", idx: number) {
    set({ [field]: value[field].filter((_, i) => i !== idx) })
  }

  // ─── Socials ───────────────────────────────────────────────────────────────
  function setSocial(id: string, url: string) {
    set({ socials: { ...value.socials, [id]: url } })
  }
  function removeSocial(id: string) {
    const copy = { ...value.socials }
    delete copy[id]
    set({ socials: copy })
  }

  const activeSocialNet = activeSocial ? SOCIAL_NETWORKS.find((n) => n.id === activeSocial) : null

  return (
    <div className="space-y-3">
      {/* ── Personal Information ──────────────────────────────────────────── */}
      <Section icon={<User size={16} />} title="Personal Information" subtitle="Fill in your information.">
        {/* Profile image */}
        <div>
          <p className="text-zinc-400 text-xs font-medium mb-2">Profile Image</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => imgInputRef.current?.click()}
              disabled={isImgUploading}
              className="w-16 h-16 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-violet-500/60 flex items-center justify-center overflow-hidden shrink-0 transition-colors"
            >
              {isImgUploading ? (
                <Loader2 size={20} className="animate-spin text-violet-400" />
              ) : value.profileImage ? (
                <img src={value.profileImage} alt="profile" className="w-full h-full object-cover" />
              ) : (
                <User size={22} className="text-zinc-600" />
              )}
            </button>
            <div>
              <p className="text-zinc-700 dark:text-zinc-300 text-xs font-medium">
                {value.profileImage ? "Photo uploaded" : "Upload photo"}
              </p>
              <p className="text-zinc-600 text-xs mt-0.5">JPG, PNG, WEBP · max 10 MB</p>
              {value.profileImage && (
                <button
                  type="button"
                  onClick={() => set({ profileImage: null })}
                  className="text-red-400 hover:text-red-300 text-xs mt-1"
                >
                  Remove
                </button>
              )}
            </div>
            <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
          </div>
        </div>

        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">First Name <span className="text-red-400">*</span></label>
            <Input
              value={value.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              placeholder="e.g. Rahul"
            />
          </div>
          <div>
            <label className="label-text">Last Name</label>
            <Input
              value={value.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
              placeholder="e.g. Mehta"
            />
          </div>
        </div>
      </Section>

      {/* ── Contact Details ───────────────────────────────────────────────── */}
      <Section icon={<Phone size={16} />} title="Contact Details" subtitle="Provide the contact information to display.">
        <div>
          <p className="text-zinc-400 text-xs font-medium mb-2">Phone</p>
          <MultiEntry
            entries={value.phones}
            labels={PHONE_LABELS}
            placeholder="+91 98765 43210"
            onAdd={() => addEntry("phones", "mobile")}
            onChange={(i, f, v2) => updateEntry("phones", i, f, v2)}
            onRemove={(i) => removeEntry("phones", i)}
          />
        </div>
        <div>
          <p className="text-zinc-400 text-xs font-medium mb-2">Email</p>
          <MultiEntry
            entries={value.emails}
            labels={EMAIL_LABELS}
            placeholder="hello@company.com"
            onAdd={() => addEntry("emails", "work")}
            onChange={(i, f, v2) => updateEntry("emails", i, f, v2)}
            onRemove={(i) => removeEntry("emails", i)}
          />
        </div>
        <div>
          <p className="text-zinc-400 text-xs font-medium mb-2">Website</p>
          <MultiEntry
            entries={value.websites}
            labels={WEBSITE_LABELS}
            placeholder="https://company.com"
            onAdd={() => addEntry("websites", "website")}
            onChange={(i, f, v2) => updateEntry("websites", i, f, v2)}
            onRemove={(i) => removeEntry("websites", i)}
          />
        </div>
      </Section>

      {/* ── Location ──────────────────────────────────────────────────────── */}
      <Section icon={<MapPin size={16} />} title="Location" subtitle="Provide your address and location information." defaultOpen={false}>
        <div>
          <label className="label-text">Street Address</label>
          <Input value={value.address} onChange={(e) => set({ address: e.target.value })} placeholder="123 Main Street, Apt 4B" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">City</label>
            <Input value={value.city} onChange={(e) => set({ city: e.target.value })} placeholder="Mumbai" />
          </div>
          <div>
            <label className="label-text">State / Province</label>
            <Input value={value.state} onChange={(e) => set({ state: e.target.value })} placeholder="Maharashtra" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">Country</label>
            <Input value={value.country} onChange={(e) => set({ country: e.target.value })} placeholder="India" />
          </div>
          <div>
            <label className="label-text">ZIP / Postal Code</label>
            <Input value={value.zip} onChange={(e) => set({ zip: e.target.value })} placeholder="400001" />
          </div>
        </div>
      </Section>

      {/* ── Company Details ───────────────────────────────────────────────── */}
      <Section icon={<Building2 size={16} />} title="Company Details" subtitle="Add more information about the business you are part of." defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">Company</label>
            <Input value={value.company} onChange={(e) => set({ company: e.target.value })} placeholder="Acme Inc." />
          </div>
          <div>
            <label className="label-text">Profession / Job Title</label>
            <Input value={value.profession} onChange={(e) => set({ profession: e.target.value })} placeholder="Lead Designer" />
          </div>
        </div>
        <div>
          <label className="label-text">Summary / Bio</label>
          <textarea
            value={value.summary}
            onChange={(e) => set({ summary: e.target.value })}
            placeholder="A short professional bio or description..."
            rows={4}
            className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm px-3 py-2.5 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
          />
        </div>
      </Section>

      {/* ── Social Networks ───────────────────────────────────────────────── */}
      <Section icon={<Globe size={16} />} title="Social Networks" subtitle="Add social media links to your page." defaultOpen={false}>
        {/* Icon grid */}
        <div className="flex flex-wrap gap-2">
          {SOCIAL_NETWORKS.map((net) => {
            const hasValue = !!value.socials[net.id]
            return (
              <button
                key={net.id}
                type="button"
                title={net.label}
                onClick={() => setActiveSocial(activeSocial === net.id ? null : net.id)}
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center transition-all border",
                  activeSocial === net.id
                    ? "border-violet-500 scale-110 ring-2 ring-violet-500/40"
                    : hasValue
                    ? "border-green-500/60 ring-1 ring-green-500/40"
                    : "border-transparent hover:scale-105",
                )}
              >
                <SocialIcon net={net} size={36} />
              </button>
            )
          })}
        </div>

        {/* Active social input */}
        {activeSocialNet && (
          <div className="mt-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-zinc-700 dark:text-zinc-300 text-xs font-semibold flex items-center gap-2">
                <SocialIcon net={activeSocialNet} size={20} />
                {activeSocialNet.label}
              </p>
              {value.socials[activeSocialNet.id] && (
                <button
                  type="button"
                  onClick={() => removeSocial(activeSocialNet.id)}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  Remove
                </button>
              )}
            </div>
            <Input
              value={value.socials[activeSocialNet.id] ?? ""}
              onChange={(e) => setSocial(activeSocialNet.id, e.target.value)}
              placeholder={activeSocialNet.placeholder}
              className="text-sm"
              autoFocus
            />
          </div>
        )}

        {/* Added list */}
        {Object.keys(value.socials).length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-zinc-500 text-xs">Added:</p>
            {Object.entries(value.socials)
              .filter(([, v]) => v)
              .map(([id, url]) => {
                const net = SOCIAL_NETWORKS.find((n) => n.id === id)
                return (
                  <div key={id} className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{net?.icon}</span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{net?.label}</span>
                    <span className="truncate flex-1 text-zinc-500">{url}</span>
                    <button type="button" onClick={() => removeSocial(id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── buildVCardContent helper (called from parent buildContent) ─────────────────

export function buildVCardContent(
  data: VCardData,
  firstName: string,
  lastName: string,
): Record<string, unknown> {
  return {
    firstName,
    lastName,
    profileImage: data.profileImage,
    phones: data.phones.filter((p) => p.value),
    emails: data.emails.filter((e) => e.value),
    websites: data.websites.filter((w) => w.value),
    address: data.address,
    city: data.city,
    state: data.state,
    country: data.country,
    zip: data.zip,
    company: data.company,
    jobTitle: data.profession,
    summary: data.summary,
    socials: Object.fromEntries(
      Object.entries(data.socials).filter(([, v]) => v),
    ),
  }
}
