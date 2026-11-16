import type { GuideSection } from "./generator-guides"

/**
 * One page per industry, at /use-cases/<slug> (pages/marketing/IndustryPage.tsx),
 * written for Indian businesses. Same rule as qr-type-pages.ts: only features
 * the product has, on the plans that have them (billing.service PLAN_LIMITS):
 * smart routing (device, time of day, country, language) and A/B tests are Pro
 * and above; time rules are in the rule's own time zone (since 16 Nov 2026 —
 * before that UTC only), in whole hours, every day of the week. Team seats
 * start on Pro; places, password protection and scan limits are on every plan;
 * expiry dates from Starter. No statistics we can't source.
 *
 * `slug: "…"` lines are read by scripts/public-routes.mjs (one per line,
 * indented four spaces).
 */

export interface IndustryCode {
  label: string
  href: string
  why: string
}

export interface IndustryPageContent {
  slug: string
  label: string
  title: string
  description: string
  h1: string
  accent: string
  intro: string
  codes: IndustryCode[]
  sections: GuideSection[]
  faqs: { q: string; a: string }[]
}

const PLACES = "With places, each code is tied to where it's printed, such as a branch, a counter or a site, and your analytics show scans per place."

export const INDUSTRY_PAGES: IndustryPageContent[] = [
  // ─── Restaurants ────────────────────────────────────────────────────────────
  {
    slug: "restaurants",
    label: "Restaurants and cafes",
    title: "QR Codes for Restaurants and Cafes in India",
    description: "QR codes for restaurants: a digital menu you edit any time, WiFi for guests, UPI payment, Google reviews and feedback, with scans counted per branch.",
    h1: "QR codes for restaurants and cafes —",
    accent: "menu, WiFi, payment and reviews",
    intro: "From the table card to the bill folder, the QR codes a restaurant actually needs, and how to set them up so you never reprint a menu again.",
    codes: [
      { label: "Menu", href: "/qr-codes/menu", why: "Sections, dishes, prices, veg/non-veg and allergens. Change a price from your phone." },
      { label: "WiFi", href: "/generate/wifi", why: "Guests join without asking for the password. Free, no account." },
      { label: "UPI payment", href: "/generate/upi", why: "A counter code every UPI app reads. Free, no account." },
      { label: "Google review", href: "/qr-codes/google-review", why: "Opens your review box in one scan, so happy guests actually review." },
      { label: "Feedback form", href: "/qr-codes/form", why: "A rating and a comment, emailed to you as they come in." },
      { label: "WhatsApp", href: "/generate/whatsapp", why: "Takeaway orders and table bookings straight to your WhatsApp." },
    ],
    sections: [
      {
        heading: "Set up a table card in an afternoon",
        blocks: [
          {
            steps: [
              "Build your menu as a Restaurant Menu code: add sections (Starters, Mains, Drinks) and dishes with prices.",
              "Make a free WiFi code for your guest network.",
              "Print both on a table tent: \"Scan for the menu\" and \"Scan for WiFi\", each at least 3 cm wide.",
              "Put a Google review code and a UPI code on the bill folder or the counter.",
            ],
          },
          "Read the full guide: [how to make a QR code menu for your restaurant](/blog/qr-code-menu-for-restaurants).",
        ],
      },
      {
        heading: "Change the menu, not the print",
        blocks: [
          "Prices go up, a dish runs out, the monsoon menu starts. The menu code holds a short GenXQR link, so you edit the menu in the dashboard and every table card shows the new version from the next scan. Nothing to reprint, no outdated menus on tables.",
        ],
      },
      {
        heading: "Know which branch and which table area works",
        blocks: [
          PLACES + " Give each branch its own menu code and compare scans between them.",
          "Every scan also records the time, city and device, so you can see when guests open the menu. A scan count that falls at one branch can mean the table cards there are worn or missing.",
        ],
      },
      {
        heading: "Payments and reviews, done right",
        blocks: [
          {
            list: [
              "For UPI, put a direct UPI code where people scan from their payment app, and print your business name next to it. See [which UPI code to print where](/blog/upi-qr-code-for-your-shop).",
              "Ask every guest for a Google review, not only the happy ones, and never offer a discount for one: Google doesn't allow it. See [how to get more Google reviews](/blog/google-review-qr-code).",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "What QR codes does a restaurant need?",
        a: "Usually four: a digital menu on the tables, a WiFi code for guests, a UPI code at the counter, and a Google review code on the bill. A feedback form and a WhatsApp ordering code are useful additions.",
      },
      {
        q: "Can I change menu prices without reprinting the QR code?",
        a: "Yes. A GenXQR menu is a dynamic code: edit dishes and prices in the dashboard and the printed code shows the new menu from the next scan.",
      },
      {
        q: "Can I see scans for each branch separately?",
        a: "Yes. Give each branch its own code and assign it to a place. Analytics show scans per place, as well as by time, city and device.",
      },
      {
        q: "Do the WiFi and UPI codes cost anything?",
        a: "No. WiFi and UPI codes from the free generator hold the details in the code itself, need no account and never expire.",
      },
    ],
  },

  // ─── Retail ─────────────────────────────────────────────────────────────────
  {
    slug: "retail",
    label: "Retail and kirana shops",
    title: "QR Codes for Retail Shops and Kirana Stores",
    description: "QR codes for shops: UPI payment at the counter, WhatsApp orders, Google reviews, coupons, product videos and catalogues, with scans tracked per store.",
    h1: "QR codes for shops —",
    accent: "payments, orders, reviews and repeat customers",
    intro: "A shop's counter, shelves, bags and bills are all places a customer can scan. Here is what to put on each, from a kirana counter to a chain of stores.",
    codes: [
      { label: "UPI payment", href: "/generate/upi", why: "The counter code every UPI app reads. Free, no account." },
      { label: "WhatsApp", href: "/generate/whatsapp", why: "\"Order on WhatsApp next time\" on bills and bags." },
      { label: "Google review", href: "/qr-codes/google-review", why: "More reviews on your Google listing, so nearby customers find you." },
      { label: "Coupon", href: "/qr-codes/coupon", why: "An offer customers copy in one tap, to bring them back." },
      { label: "Video", href: "/qr-codes/video", why: "How-to and product demos on the shelf or the box." },
      { label: "PDF", href: "/qr-codes/pdf", why: "Catalogues and price lists you can replace any time." },
    ],
    sections: [
      {
        heading: "The counter, the bill and the bag",
        blocks: [
          {
            list: [
              "Counter: a UPI code for payments, with your business name printed next to it so customers can check it before paying.",
              "Bill or receipt: a Google review code and a coupon for the next visit, printed as separate codes.",
              "Carry bag and delivery box: a WhatsApp code for repeat orders.",
              "Shelf: product videos or a catalogue PDF next to items that need explaining.",
            ],
          },
        ],
      },
      {
        heading: "Run offers without new labels",
        blocks: [
          "Print a coupon code on your bags once. Change the offer for Diwali, the wedding season or the end-of-season sale in the dashboard, and every bag already out there shows the new one.",
          "To compare two offers, Pro and above can split scans of one code between two destinations (an A/B test) and show how many scans each got.",
        ],
      },
      {
        heading: "More than one store",
        blocks: [
          PLACES + " Use the same design everywhere, and see which store's customers scan most.",
          "On Pro and above, staff can work in a shared team workspace with their own roles, so a store manager can update codes without your login.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is a UPI QR code from GenXQR free?",
        a: "Yes. The free UPI generator makes a code with your UPI ID and business name, with no account. Payments go straight to your bank account; GenXQR is not involved and charges nothing.",
      },
      {
        q: "How can QR codes bring customers back to my shop?",
        a: "Print a coupon code and a WhatsApp ordering code on bills and bags. The coupon gives a reason to return, and WhatsApp makes the next order one message away.",
      },
      {
        q: "Can I track scans for each of my stores?",
        a: "Yes. Give each store its own code and assign it to a place; analytics show scans per place.",
      },
    ],
  },

  // ─── Real estate ────────────────────────────────────────────────────────────
  {
    slug: "real-estate",
    label: "Real estate",
    title: "QR Codes for Real Estate — Boards, Brochures, Leads",
    description: "QR codes for real estate: brochures, floor plans, photo galleries and video walkthroughs on site boards and flyers, plus lead forms and agent contact cards.",
    h1: "QR codes for real estate —",
    accent: "from the site board to a lead",
    intro: "Most people who see your board or flyer will never call. A QR code lets them look at the property first, and leave their details when they're interested.",
    codes: [
      { label: "PDF brochure", href: "/qr-codes/pdf", why: "Brochure, floor plans and price list, replaced when they change." },
      { label: "Image gallery", href: "/qr-codes/image-gallery", why: "Interior and amenity photos on the board outside." },
      { label: "Video", href: "/qr-codes/video", why: "A walkthrough of the flat or the project." },
      { label: "Lead form", href: "/qr-codes/form", why: "Name, phone and budget, emailed to you as each enquiry arrives." },
      { label: "vCard", href: "/qr-codes/vcard", why: "The agent's contact card, saved in one tap." },
      { label: "WhatsApp", href: "/generate/whatsapp", why: "\"Send me details\" straight to your WhatsApp." },
    ],
    sections: [
      {
        heading: "What to put where",
        blocks: [
          {
            list: [
              "Site board and hoardings: a large code linking to the gallery or video, so passers-by can see inside.",
              "Flyers and newspaper inserts: the brochure PDF, and a lead form for people who want a call back.",
              "Sample flat and site office: the lead form at the reception, and the agent's vCard on visiting cards.",
              "Property listings on WhatsApp: share the same links the codes open.",
            ],
          },
        ],
      },
      {
        heading: "Keep prices and availability current",
        blocks: [
          "Price lists and inventory change during a launch. Replace the PDF or the photos in the dashboard and every board, flyer and hoarding shows the new version from the next scan.",
          "For information you don't want public, such as a broker price sheet, password-protect the code. Scanners enter the password before the page opens.",
        ],
      },
      {
        heading: "See which board brings enquiries",
        blocks: [
          PLACES + " Put a separate code on each hoarding, flyer drop and newspaper insert, and compare their scans and the leads that follow.",
        ],
      },
    ],
    faqs: [
      {
        q: "How do real estate agents use QR codes?",
        a: "On site boards, flyers and visiting cards: to open a photo gallery, a video walkthrough or the brochure, to save the agent's contact, and to collect enquiries through a short form.",
      },
      {
        q: "Can I update the brochure after printing the board?",
        a: "Yes. The code is dynamic: upload the new brochure in the dashboard and the same board leads to it from the next scan.",
      },
      {
        q: "Can I collect leads with a QR code?",
        a: "Yes. A lead form code asks for the details you choose (name, phone, budget, preferred flat size) and emails you each enquiry. You can download all of them as a CSV.",
      },
    ],
  },

  // ─── Events ─────────────────────────────────────────────────────────────────
  {
    slug: "events",
    label: "Events and weddings",
    title: "QR Codes for Events and Weddings",
    description: "QR codes for events and weddings: details with a map and add-to-calendar, RSVP forms, photo galleries, guest WiFi and UPI for gifts. Edit if plans change.",
    h1: "QR codes for events and weddings —",
    accent: "invitations that stay up to date",
    intro: "One code on the invitation or the standee gives guests the venue, the time, directions and the calendar entry, and keeps working if the plan changes.",
    codes: [
      { label: "Event", href: "/qr-codes/event", why: "Date, venue, Open in Maps and add to Google, Apple or Outlook calendar." },
      { label: "RSVP / feedback form", href: "/qr-codes/form", why: "Who's coming, how many, any food preferences." },
      { label: "Image gallery", href: "/qr-codes/image-gallery", why: "Share the photos with guests after the day." },
      { label: "Link-in-bio", href: "/qr-codes/link-in-bio", why: "Schedule, venue, livestream and registration on one page." },
      { label: "WiFi", href: "/generate/wifi", why: "Guest WiFi at the venue." },
      { label: "UPI payment", href: "/generate/upi", why: "For registrations, stalls or shagun." },
    ],
    sections: [
      {
        heading: "Invitations and posters",
        blocks: [
          "An Event code shows the name, the date and time in the event's own time zone, the venue with an Open in Maps link, and buttons to add it to Google Calendar or Apple and Outlook calendars. Guests coming from another city get the right time, and nobody has to type the address into Maps.",
          "Add a ticket or registration link and the page shows a Tickets & registration button.",
        ],
      },
      {
        heading: "When the venue or time changes",
        blocks: [
          "Change it in the dashboard. Every invitation already printed or forwarded on WhatsApp shows the new details from the next scan, which saves a round of \"please note the change\" messages.",
        ],
      },
      {
        heading: "At the venue",
        blocks: [
          {
            list: [
              "Standees at the entrance: the schedule as a link-in-bio page, plus WiFi.",
              "Stalls and exhibitors: a feedback form and each exhibitor's vCard.",
              "After the event: point the same standee code at the photo gallery or the recording.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Can guests add my event to their calendar from a QR code?",
        a: "Yes. The event page has buttons to add it to Google Calendar, or to Apple and Outlook calendars with a standard calendar file.",
      },
      {
        q: "Can I collect RSVPs with a QR code?",
        a: "Yes. A form code can ask for name, number of guests and preferences, and emails you each reply. Download all replies as a CSV.",
      },
      {
        q: "What if the venue changes after the invitations are printed?",
        a: "Edit the event in the dashboard. The printed code shows the new venue and time from the next scan.",
      },
    ],
  },

  // ─── Healthcare ─────────────────────────────────────────────────────────────
  {
    slug: "healthcare",
    label: "Clinics and healthcare",
    title: "QR Codes for Clinics, Hospitals and Pharmacies",
    description: "QR codes for clinics and pharmacies: appointment booking, doctor contact cards, opening hours, patient instructions, feedback and Google reviews.",
    h1: "QR codes for clinics and healthcare —",
    accent: "fewer phone calls, clearer instructions",
    intro: "Waiting rooms, prescriptions and pharmacy bags are full of information patients need later. QR codes keep it with them, and current.",
    codes: [
      { label: "Business page", href: "/qr-codes/business", why: "Timings for each day, phone, address. Update for holidays." },
      { label: "vCard", href: "/qr-codes/vcard", why: "A doctor's contact card, saved to the patient's phone." },
      { label: "PDF", href: "/qr-codes/pdf", why: "Diet charts, post-procedure care and preparation instructions." },
      { label: "Video", href: "/qr-codes/video", why: "How to use an inhaler, an insulin pen or a device." },
      { label: "Feedback form", href: "/qr-codes/form", why: "Ratings and comments as patients leave." },
      { label: "Google review", href: "/qr-codes/google-review", why: "More reviews for the clinic's Google listing." },
    ],
    sections: [
      {
        heading: "Where clinics use QR codes",
        blocks: [
          {
            list: [
              "Reception and the door: a business page with the timings for each day, so patients stop calling to ask.",
              "Prescriptions and discharge papers: instructions as a PDF or a short video they can open again at home.",
              "Pharmacy bags: a video on how to use the product, and the pharmacy's WhatsApp for refills.",
              "Exit: a feedback form and a Google review code.",
            ],
          },
          "To book appointments through an existing system, make a [free URL QR code](/generate/url) for its link, or a dynamic one to track scans.",
        ],
      },
      {
        heading: "Keep patient information private",
        blocks: [
          "Never put a patient's personal or medical details in a QR code or on a scan page. Use QR codes for general information: timings, instructions, contact details, forms.",
          "For internal documents shared with staff, password-protect the code so only people with the password can open it.",
        ],
      },
      {
        heading: "Update timings without new notices",
        blocks: [
          "Holiday closures and changed OPD timings are a constant. Edit the business page in the dashboard and the code on the door shows the new hours from the next scan.",
        ],
      },
    ],
    faqs: [
      {
        q: "How can a clinic use QR codes?",
        a: "For timings and contact details on the door, a doctor's contact card, patient instructions as PDFs or videos, feedback forms and Google reviews.",
      },
      {
        q: "Is it safe to share patient information through a QR code?",
        a: "Don't. Anyone who scans a code can see what it opens. Use QR codes for general information, and password-protect anything meant only for staff.",
      },
      {
        q: "Can I change the clinic timings after printing the QR code?",
        a: "Yes. Edit the business page in the dashboard and the printed code shows the new timings from the next scan.",
      },
    ],
  },

  // ─── Education ──────────────────────────────────────────────────────────────
  {
    slug: "education",
    label: "Schools and coaching institutes",
    title: "QR Codes for Schools, Colleges and Coaching",
    description: "QR codes for schools and coaching institutes: prospectus, timetables, admission enquiry forms, event details, video lessons and fee payment by UPI.",
    h1: "QR codes for schools and coaching institutes —",
    accent: "notices that stay current",
    intro: "Notice boards, admission flyers, worksheets and ID cards. A QR code turns each of them into something parents and students can open on their phones, and you can update.",
    codes: [
      { label: "PDF", href: "/qr-codes/pdf", why: "Prospectus, timetables, syllabus, results notices." },
      { label: "Enquiry form", href: "/qr-codes/form", why: "Admission enquiries from flyers and hoardings, straight to your inbox." },
      { label: "Video", href: "/qr-codes/video", why: "Lesson recordings and lab demos next to the worksheet." },
      { label: "Event", href: "/qr-codes/event", why: "Annual day, PTMs and open houses with add-to-calendar." },
      { label: "UPI payment", href: "/generate/upi", why: "Fee or event payments to the institution's UPI ID." },
      { label: "Image gallery", href: "/qr-codes/image-gallery", why: "Campus and event photos for parents." },
    ],
    sections: [
      {
        heading: "Admissions season",
        blocks: [
          "Put an enquiry form code on flyers, hoardings and newspaper ads: parents leave the student's name, class and a phone number, and each enquiry arrives by email. Give each channel its own code to see which brings the most.",
          "Link the prospectus as a PDF code, so the newest version is always the one parents get.",
        ],
      },
      {
        heading: "In the classroom",
        blocks: [
          {
            list: [
              "Worksheets and textbooks: a video explaining the chapter.",
              "Notice boards: the timetable PDF, replaced when it changes.",
              "Labs and libraries: instructions and reading lists.",
            ],
          },
        ],
      },
      {
        heading: "For the whole staff",
        blocks: [
          "On Pro and above, teachers and office staff can work in a shared workspace with their own roles: editors update codes, viewers see analytics. Organise codes into folders by class, subject or campus.",
        ],
      },
    ],
    faqs: [
      {
        q: "How do schools use QR codes?",
        a: "For the prospectus and timetables as PDFs, admission enquiry forms, event details with add-to-calendar, lesson videos on worksheets, and fee payments by UPI.",
      },
      {
        q: "Can I update a timetable after printing the QR code?",
        a: "Yes. Upload the new PDF in the dashboard and the printed code opens it from the next scan.",
      },
      {
        q: "Can several teachers manage the QR codes?",
        a: "Yes, on Pro and above: invite staff to a shared workspace as admins, editors or viewers.",
      },
    ],
  },

  // ─── Hotels ─────────────────────────────────────────────────────────────────
  {
    slug: "hotels",
    label: "Hotels and homestays",
    title: "QR Codes for Hotels, Resorts and Homestays",
    description: "QR codes for hotels and homestays: in-room WiFi, room service menus, local guides, guest feedback and Google reviews, with pages in the guest's language.",
    h1: "QR codes for hotels and homestays —",
    accent: "everything guests ask the front desk",
    intro: "WiFi password, breakfast timings, the room service menu, how to get to the station. Put the answers in the room, and the front desk phone rings less.",
    codes: [
      { label: "WiFi", href: "/generate/wifi", why: "In every room, so guests join in one scan." },
      { label: "Menu", href: "/qr-codes/menu", why: "Room service and restaurant menus, prices updated any time." },
      { label: "Link-in-bio", href: "/qr-codes/link-in-bio", why: "A guest guide: timings, amenities, local sights, taxi numbers." },
      { label: "Feedback form", href: "/qr-codes/form", why: "Hear about problems before the guest checks out." },
      { label: "Google review", href: "/qr-codes/google-review", why: "More reviews, asked for at the right moment." },
      { label: "WhatsApp", href: "/generate/whatsapp", why: "A direct line to the front desk." },
    ],
    sections: [
      {
        heading: "A card in every room",
        blocks: [
          {
            list: [
              "WiFi, so guests join without calling the desk.",
              "A guest guide as a link-in-bio page: breakfast and checkout times, amenities, nearby sights and transport.",
              "Room service: a menu code with dishes and prices.",
              "A WhatsApp code for requests: towels, late checkout, a taxi.",
            ],
          },
        ],
      },
      {
        heading: "Guests from everywhere",
        blocks: [
          "On Pro and above, smart routing can send a scan to a different page by the phone's language, so a guest whose phone is set to French opens your French guide. It can also route by country or by device.",
        ],
      },
      {
        heading: "Reviews and feedback, in that order",
        blocks: [
          "A feedback form in the room catches problems while you can still fix them. A Google review code at checkout asks every guest for a review. Ask everyone, and don't offer rewards for reviews: Google doesn't allow it.",
          PLACES + " Compare properties or floors.",
        ],
      },
    ],
    faqs: [
      {
        q: "What QR codes should a hotel room have?",
        a: "WiFi, a guest guide with timings and local information, the room service menu, and a WhatsApp line to the front desk. A feedback form helps you hear about problems before checkout.",
      },
      {
        q: "Can the QR code show a different language for foreign guests?",
        a: "Yes, on Pro and above. Smart routing can send scans to a different page based on the language the guest's phone is set to.",
      },
      {
        q: "Can I change the WiFi password later?",
        a: "A WiFi code holds the password, so a new password needs a new code. Everything else (menus, guides, forms) can be changed without reprinting.",
      },
    ],
  },

  // ─── Packaging ──────────────────────────────────────────────────────────────
  {
    slug: "packaging",
    label: "Product packaging",
    title: "QR Codes on Product Packaging — Manuals, Videos",
    description: "QR codes for product packaging: manuals, how-to videos, warranty and support, reorders on WhatsApp and app downloads. Change content without reprinting packs.",
    h1: "QR codes on product packaging —",
    accent: "update the content, not the carton",
    intro: "Packaging is printed in lakhs and lives for years. A dynamic code on the pack lets you change what it opens, long after the cartons have shipped.",
    codes: [
      { label: "Video", href: "/qr-codes/video", why: "Setup, recipes and how-to videos." },
      { label: "PDF", href: "/qr-codes/pdf", why: "Manuals, ingredient details and warranty terms." },
      { label: "Link-in-bio", href: "/qr-codes/link-in-bio", why: "Support, warranty registration, reorder and social on one page." },
      { label: "WhatsApp", href: "/generate/whatsapp", why: "Customer support and reorders." },
      { label: "App download", href: "/qr-codes/app", why: "Your app, for iPhone and Android, from one code." },
      { label: "Coupon", href: "/qr-codes/coupon", why: "A reason for the next purchase." },
    ],
    sections: [
      {
        heading: "Why packaging needs a dynamic code",
        blocks: [
          "A static code on a pack is fixed for the life of that print run. If the website changes, the campaign ends or the link breaks, every pack in every shop points to the wrong place. A dynamic code holds a short GenXQR link: change where it points in the dashboard and every pack follows.",
          "You also see how many people scan the pack, and in which cities. That's a signal of where your product is being bought and used.",
        ],
      },
      {
        heading: "Design for the shelf",
        blocks: [
          {
            list: [
              "Print the code at least 2 cm wide on small packs, larger on cartons, with a quiet margin around it.",
              "Dark dots on a light background. Test the printed proof, not just the screen file, under shop lighting.",
              "Say what the scan gives: \"Scan for the recipe video\" gets more scans than a bare code.",
              "Use the EPS or SVG download for your print vendor, so the code stays sharp at any size.",
            ],
          },
          "See the full [print checklist](/blog/qr-codes-that-scan-print-checklist).",
        ],
      },
      {
        heading: "Many SKUs",
        blocks: [
          "Pro and above can create codes in bulk from a CSV, one per SKU or batch, organised into folders. Each gets its own scan analytics, so you can see which products are scanned most.",
          "A QR code on a pack is not a retail barcode: keep your EAN barcode for billing, and check your regulator's rules on what must be printed on the pack itself.",
        ],
      },
    ],
    faqs: [
      {
        q: "Why use a dynamic QR code on packaging?",
        a: "Because packaging can't be reprinted. A dynamic code lets you change what the code opens (a new video, an updated manual, a new offer) after the packs have shipped, and shows how many people scan them.",
      },
      {
        q: "Can I make QR codes for many products at once?",
        a: "Yes, on Pro and above: upload a CSV to create one code per SKU or batch, and organise them in folders.",
      },
      {
        q: "Can a QR code replace the barcode on my product?",
        a: "No. Keep your EAN barcode for billing at the counter. The QR code is for customers: manuals, videos, support and offers.",
      },
    ],
  },
]

const BY_SLUG = new Map(INDUSTRY_PAGES.map((p) => [p.slug, p]))

export function industryPage(slug: string): IndustryPageContent | undefined {
  return BY_SLUG.get(slug)
}
