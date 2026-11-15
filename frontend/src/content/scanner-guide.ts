import type { GuideSection } from "./generator-guides"

/**
 * The written part of /scanner. The page was the tool alone (97 words), so it
 * had nothing for search engines or AI answers to rank or quote. Facts only:
 * decoding is done in the browser (lib/qrDecode.ts, jsQR), the image is never
 * uploaded, and a result is shown first — links open only when the person
 * taps the button (QRScannerPage ScanResultModal).
 */
export const SCANNER_SECTIONS: GuideSection[] = [
  {
    heading: "How to scan a QR code online",
    blocks: [
      "There are two ways, and both work on phones and computers:",
      {
        steps: [
          "With your camera: tap Enable Camera, allow camera access when your browser asks, and point the camera at the code. On a phone, Flip switches between the front and back cameras. The result appears as soon as the code is read.",
          "From an image: click Upload Image, or drag a picture onto it. Use this for a QR code in a screenshot, a photo, a PDF you took a screenshot of, or an email attachment, when there's no second phone to scan your screen with.",
        ],
      },
      "Nothing is installed and you don't need an account.",
    ],
  },
  {
    heading: "What it can read",
    blocks: [
      "The scanner decodes standard QR codes and shows what is inside in a readable way, with a button for the next step:",
      {
        list: [
          "Links: the full address, so you can check it before opening it.",
          "WiFi: the network name, security type and password.",
          "Contact cards (vCard): name, phone, email and address, with an option to save the contact.",
          "UPI payment codes: the UPI ID, the payee's name and the amount, if one is set.",
          "WhatsApp, SMS, phone and email codes: the number or address and any pre-filled message.",
          "Plain text, which you can copy.",
        ],
      },
      "It also reads codes in brand colours, low-contrast codes and inverted (light-on-dark) codes, which many basic scanners miss.",
    ],
  },
  {
    heading: "Is it private?",
    blocks: [
      "Yes. The image or camera feed is decoded inside your browser on your own device. It is not uploaded to GenXQR or anywhere else, so it is safe to scan a code containing a WiFi password or a contact card.",
    ],
  },
  {
    heading: "Check before you open: avoiding QR code scams",
    blocks: [
      "A QR code can hide any link, which is why fraudsters stick fake codes over real ones on parking meters, posters and shop counters. This scanner always shows you what a code contains first, and opens a link only when you tap the button. Before you do:",
      {
        list: [
          "Read the web address. Be wary of misspelled brand names, unusual endings or link shorteners where you'd expect an official site.",
          "Never enter a password, card number or OTP on a page you reached from a code you didn't expect.",
          "For UPI codes, check the payee name matches the shop or person you mean to pay. Scanning a code is only ever for paying; you never need to scan one to receive money.",
          "If a printed code looks like a sticker placed over another, ask before scanning.",
        ],
      },
    ],
  },
  {
    heading: "Scanning without this page",
    blocks: [
      "Most phones read QR codes from the camera app. On iPhone, open Camera and point it at the code; on Android, use the camera or Google Lens. Use this page when the code is on your own screen, when your phone's camera doesn't react, or when you want to see exactly what a code contains before acting on it.",
      "Need to make a code instead? Use the [free QR code generator](/generate).",
    ],
  },
]

export const SCANNER_FAQS: { q: string; a: string }[] = [
  {
    q: "How do I scan a QR code from an image or screenshot?",
    a: "Click Upload Image on this page and choose the picture, or drag it onto the box. The scanner reads the QR code from the image and shows what it contains. It works with PNG, JPG, WEBP and GIF images.",
  },
  {
    q: "Can I scan a QR code on my laptop or computer?",
    a: "Yes. Allow your laptop's webcam and hold the code up to it, or upload an image or screenshot of the code. No app is needed; it runs in the browser.",
  },
  {
    q: "Is this QR code scanner free and safe?",
    a: "It is free, with no sign-up. The image is decoded on your own device and never uploaded, and links are only opened when you tap the button after seeing the full address.",
  },
  {
    q: "Why won't my QR code scan?",
    a: "Common causes are a blurry or partly cut-off image, glare, too little contrast between the code and its background, or a code printed too small. Try a sharper, straight-on photo with the whole code and some empty margin around it visible. Very damaged codes may not be readable at all.",
  },
  {
    q: "How can I tell if a QR code is a scam?",
    a: "Scan it here first and read what it contains before opening anything. Be wary of misspelled addresses, unexpected payment requests, and pages asking for passwords, card details or OTPs. For UPI codes, check the payee name. You never need to scan a code to receive money.",
  },
]
