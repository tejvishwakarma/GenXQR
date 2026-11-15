import type { GuideSection } from "./generator-guides"

/**
 * One page per dynamic QR type, at /qr-codes/<slug> (pages/marketing/QRTypePage.tsx).
 *
 * Every sentence must be true of the product as built. Checked 15 Nov 2026
 * against the editor (CreateQRPage, VCardEditor, FormBuilder), the scan-page
 * templates (pages/landing/templates) and scan.service. Things the product
 * does NOT do, so never claim them: an in-browser PDF viewer (uploads are
 * served as downloads), YouTube/Vimeo embeds (VIDEO is an uploaded file), iOS
 * or Android store detection (APP shows both buttons), a map on BUSINESS pages,
 * vCard bio or social links on the scan page, menus from a PDF (MENU is
 * itemised), a scannable coupon barcode, live Facebook follower counts, MP3
 * cover art, a per-code page colour (only EVENT and FORM take one).
 *
 * `slug: "…"` lines are read by scripts/public-routes.mjs for the sitemap and
 * prerender, so keep each on its own line, indented four spaces.
 */

export interface QRTypePageContent {
  slug: string
  /** CreateQRPage's type key; "Create" links open the editor on it (?type=). */
  editorKey: string
  /** As used in "<label> QR code". */
  label: string
  /** One line for lists (hub, related). */
  summary: string
  title: string
  description: string
  h1: string
  accent: string
  intro: string
  sections: GuideSection[]
  faqs: { q: string; a: string }[]
  related: string[]
}

const EDIT_LATER = "Because it is a dynamic code, the printed image only holds a short GenXQR link. Change the content in your dashboard and every printed copy shows the new version the next time it is scanned."

export const QR_TYPE_PAGES: QRTypePageContent[] = [
  // ─── vCard ──────────────────────────────────────────────────────────────────
  {
    slug: "vcard",
    editorKey: "vcard",
    label: "vCard",
    summary: "A digital business card that saves to contacts",
    title: "vCard QR Code Generator — Digital Business Card",
    description: "Make a vCard QR code: scanning shows your digital business card and saves your name, numbers, email, website and address to the phone's contacts in one tap.",
    h1: "vCard QR code generator —",
    accent: "your business card, saved in one tap",
    intro: "Put a QR code on your visiting card, name badge or email signature. Scanning it opens your digital business card, and one tap saves you to the phone's contacts.",
    sections: [
      {
        heading: "What is a vCard QR code?",
        blocks: [
          "vCard is the standard file format for contact details that every phone's address book understands. A vCard QR code opens a page with your photo, name, job title, company, phone numbers, email addresses, websites and address. A Save to Contacts button adds all of it to the phone in one step, so nobody has to type your number from a card.",
          "Phone numbers, email addresses and websites on the page are tappable, so people can call, email or visit you straight from the scan.",
        ],
      },
      {
        heading: "What you can put on it",
        blocks: [
          {
            list: [
              "A profile photo (JPG, PNG or WEBP).",
              "First and last name, job title and company.",
              "As many phone numbers, email addresses and websites as you need, each with a label such as mobile, work or home.",
              "Your street address, city, state, country and PIN code.",
            ],
          },
        ],
      },
      {
        heading: "Why a dynamic vCard beats printing your details in the code",
        blocks: [
          "A vCard can also be stored directly inside a QR code, but then every detail you add makes the code denser and harder to scan, and a new job title or phone number means reprinting every card. " + EDIT_LATER,
          "You can also see how many people scanned your card, and when and where. That's useful after a trade show or a networking event.",
        ],
      },
      {
        heading: "Where to use it",
        blocks: [
          {
            list: [
              "On the back of visiting cards, so the paper card becomes a saved contact.",
              "On name badges and lanyards at events and exhibitions.",
              "In email signatures, presentations and brochures.",
              "On shop counters and reception desks, for a business owner or sales team.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How does a vCard QR code save a contact?",
        a: "Scanning it opens your contact page. Tapping Save to Contacts downloads a standard .vcf contact file, which the phone offers to add to its address book with your name, numbers, emails, websites, company, title and address filled in.",
      },
      {
        q: "Can I change my details after printing the QR code?",
        a: "Yes. A GenXQR vCard code is dynamic: edit your details in the dashboard and the printed code shows the new ones the next time it is scanned. No reprinting.",
      },
      {
        q: "Does it work on iPhone and Android?",
        a: "Yes. Both read QR codes from the camera, open the contact page in the browser, and can add the downloaded contact file to the address book.",
      },
      {
        q: "Can a team have one vCard QR code each?",
        a: "Yes. Create one code per person; each has its own scan analytics. On plans with team seats, colleagues can work in a shared workspace with their own roles.",
      },
    ],
    related: ["business", "link-in-bio", "social-media"],
  },

  // ─── PDF ────────────────────────────────────────────────────────────────────
  {
    slug: "pdf",
    editorKey: "pdf",
    label: "PDF",
    summary: "Share a brochure, catalogue or document",
    title: "PDF QR Code Generator — Share a PDF in One Scan",
    description: "Make a PDF QR code for brochures, catalogues, manuals and price lists. Upload a PDF up to 100 MB and replace it any time without reprinting the code.",
    h1: "PDF QR code generator —",
    accent: "share any document in one scan",
    intro: "Upload a PDF and get a QR code that leads straight to it. Replace the file whenever it changes, and the printed code keeps working.",
    sections: [
      {
        heading: "What is a PDF QR code?",
        blocks: [
          "A PDF QR code gives people your document from a scan: a brochure, catalogue, price list, product manual, certificate, prospectus or event schedule. The scan page shows the document's name with buttons to open and download it.",
          "The file is stored by GenXQR, so you don't need a website or a Google Drive link, and nobody sees a request-access screen.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Start a dynamic code and choose PDF.",
              "Upload your PDF (up to 100 MB).",
              "Name the code; the name is shown on the scan page.",
              "Style the QR code, download it and test it on a phone before printing.",
            ],
          },
          "Files count towards your plan's storage: 1 GB on Starter, 5 GB on Pro and 50 GB on Business.",
        ],
      },
      {
        heading: "Keep printed material up to date",
        blocks: [
          "Prices change, catalogues get new products and manuals get revised. With a printed link to a PDF you either reprint or leave customers with the old version. " + EDIT_LATER,
          "Keep the PDF reasonably small (compress large images) so it downloads quickly on mobile data.",
        ],
      },
      {
        heading: "Where PDF QR codes are used",
        blocks: [
          {
            list: [
              "Product packaging and inserts: manuals, warranty terms, ingredients.",
              "Retail shelves and exhibition stands: catalogues and spec sheets.",
              "Real estate boards and flyers: floor plans and brochures.",
              "Schools and coaching institutes: prospectus, timetables, results.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How big can the PDF be?",
        a: "Up to 100 MB per file. Uploads count towards your plan's storage, which starts at 1 GB on Starter.",
      },
      {
        q: "Can I replace the PDF after printing the QR code?",
        a: "Yes. Upload the new file in the dashboard and the same printed code leads to it from the next scan.",
      },
      {
        q: "Do people need an app to open the PDF?",
        a: "No. Every phone opens or downloads PDFs with its built-in viewer. The scan page offers open and download buttons.",
      },
      {
        q: "Can I see how many people opened my brochure?",
        a: "You see how many times the code was scanned, with the time, city, device and browser of each scan.",
      },
    ],
    related: ["menu", "image-gallery", "video"],
  },

  // ─── Menu ───────────────────────────────────────────────────────────────────
  {
    slug: "menu",
    editorKey: "menu",
    label: "Menu",
    summary: "A digital restaurant menu you can edit any time",
    title: "QR Code Menu for Restaurants — Edit Prices Any Time",
    description: "Make a QR code menu for your restaurant or cafe: sections, dishes, prices, veg and non-veg marks and allergens on a mobile page you can edit any time.",
    h1: "QR code menu for restaurants —",
    accent: "change prices without reprinting",
    intro: "Type your menu in once, put one QR code on every table, and update dishes and prices from your phone whenever they change.",
    sections: [
      {
        heading: "What is a QR code menu?",
        blocks: [
          "A QR code menu is a digital menu guests open by scanning a code on the table, the counter or a takeaway bag. GenXQR builds the menu as a proper mobile page, not a photo of your printed menu: guests see your restaurant name, tabs for each section (Starters, Mains, Drinks…), and a card for each dish with its price.",
          "Each dish can show a short description, allergens and a veg or non-veg mark, the green and red dots Indian diners look for.",
        ],
      },
      {
        heading: "How to build your menu",
        blocks: [
          {
            steps: [
              "Start a dynamic code and choose Restaurant Menu.",
              "Enter the restaurant name, a short description and your currency (₹ by default).",
              "Add sections, then dishes in each: name, price, an optional description, allergens and veg or non-veg.",
              "Download the QR code and print it on table tents, stickers or the counter.",
            ],
          },
        ],
      },
      {
        heading: "Why a text menu works better than a PDF or photo",
        blocks: [
          "Photos and PDFs of a printed menu are hard to read on a phone: guests pinch and zoom, and the file is slow on mobile data. A menu built as a page is readable at phone size, loads quickly and is easy to browse by section.",
          "When a price changes or a dish runs out, edit it in the dashboard. " + EDIT_LATER,
        ],
      },
      {
        heading: "Tips for table QR codes",
        blocks: [
          {
            list: [
              "Print the code at least 3 cm wide on table cards, with \"Scan for the menu\" next to it.",
              "Laminate or use a stand, so it survives spills and cleaning.",
              "Keep a few printed menus for guests who prefer paper.",
              "Add your WiFi as a separate code on the same card: see the [free WiFi QR code generator](/generate/wifi).",
            ],
          },
          "Read the full guide: [how to make a QR code menu for your restaurant](/blog/qr-code-menu-for-restaurants).",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I make a QR code menu for my restaurant?",
        a: "Create a dynamic code, choose Restaurant Menu, and enter your sections and dishes with prices. GenXQR turns it into a mobile menu page and gives you a QR code to print on your tables. Edit the menu any time without reprinting.",
      },
      {
        q: "Can I show veg and non-veg dishes?",
        a: "Yes. Each dish can be marked veg or non-veg, shown as a green or red dot, and can list allergens.",
      },
      {
        q: "Can I upload my existing PDF menu instead?",
        a: "The Restaurant Menu type is typed in dish by dish, which reads far better on a phone. If you'd rather share an existing file, use a PDF QR code.",
      },
      {
        q: "Can guests order or pay through the menu?",
        a: "No, it is a menu to read. Guests order with your staff as usual. For payment, put a UPI QR code at the counter.",
      },
    ],
    related: ["google-review", "form", "pdf"],
  },

  // ─── Google review ──────────────────────────────────────────────────────────
  {
    slug: "google-review",
    editorKey: "review",
    label: "Google review",
    summary: "Open your Google review box in one scan",
    title: "Google Review QR Code — Get More Reviews",
    description: "Make a Google review QR code that opens your business's review box directly. Print it on bills, counters and packaging to collect more Google reviews.",
    h1: "Google review QR code —",
    accent: "one scan to your review box",
    intro: "Happy customers rarely go looking for your review page. A QR code that opens it directly turns \"I'll review you later\" into a review now.",
    sections: [
      {
        heading: "What is a Google review QR code?",
        blocks: [
          "It is a QR code that takes customers straight to the place where they write a review of your business on Google, with no searching for your business and no scrolling to find the button. Fewer steps means more of the customers who mean to leave a review actually do.",
          "GenXQR's Google review code sends the scanner directly to Google, so it opens as fast as a plain link.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Get your review link from your Google Business Profile: open it on Google Search or Maps and use \"Ask for reviews\" or \"Share review form\". You can also use your Place ID.",
              "Start a dynamic code, choose Google Review and paste the link or Place ID.",
              "Download the code and print it where happy customers are.",
            ],
          },
          "GenXQR only accepts review links on Google's own addresses, so a mistyped or wrong link is caught before you print.",
        ],
      },
      {
        heading: "Where to put it",
        blocks: [
          {
            list: [
              "On the bill folder or the printed bill in restaurants and cafes.",
              "At the counter, the reception desk or the clinic exit.",
              "On delivery bags, packaging and thank-you cards.",
              "On a card handed over when a job is finished: salons, repair shops, hotels.",
            ],
          },
          "Asking out loud helps: \"If you liked it, a Google review really helps us. Just scan this.\"",
        ],
      },
      {
        heading: "Stay within Google's rules",
        blocks: [
          "Google doesn't allow offering discounts or gifts in exchange for reviews, or asking only happy customers to review. Invite everyone, and don't make the QR code part of a reward. Read more in [how to get more Google reviews with a QR code](/blog/google-review-qr-code).",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I get my Google review link?",
        a: "Open your Google Business Profile on Google Search or Maps while signed in as the owner, then use \"Ask for reviews\" or \"Share review form\" to copy the link. Paste that link, or your Place ID, into GenXQR.",
      },
      {
        q: "Will the QR code open the review form directly?",
        a: "Yes. Scanning sends the customer straight to your review link on Google, which opens the review form for your business.",
      },
      {
        q: "Can I count how many people scanned it?",
        a: "Yes. You see every scan with its time, city and device. Google doesn't tell anyone which scans became reviews, but you can compare scans with your new reviews.",
      },
      {
        q: "Can I offer a discount for a review?",
        a: "No. Google's policies don't allow incentives for reviews. Ask every customer, without a reward.",
      },
    ],
    related: ["menu", "form", "coupon"],
  },

  // ─── Event ──────────────────────────────────────────────────────────────────
  {
    slug: "event",
    editorKey: "event",
    label: "Event",
    summary: "Event details, map and add to calendar",
    title: "Event QR Code — Details, Map and Add to Calendar",
    description: "Make an event QR code: date and time, venue with a map link, tickets, and add to Google, Apple or Outlook calendar in one tap. Edit it if plans change.",
    h1: "Event QR code —",
    accent: "details, directions and the calendar in one scan",
    intro: "Put one code on your poster or invitation. Guests see the date, time and venue, open the location in Maps, buy tickets and add the event to their calendar.",
    sections: [
      {
        heading: "What does an event QR code show?",
        blocks: [
          {
            list: [
              "The event name, and the date and time in the event's own time zone, so they're right for guests travelling in.",
              "The venue and address, with an Open in Maps link.",
              "A description and the organiser's name.",
              "A Tickets & registration button, if you add a link.",
              "Add to Google Calendar, and Add to Apple / Outlook calendar (a standard calendar file).",
            ],
          },
          "You can choose the page's accent colour to match your event.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Start a dynamic code and choose Event.",
              "Enter the name, start and (optionally) end time, and the time zone.",
              "Add the venue, address, description, organiser and ticket link as needed.",
              "Download the code and put it on posters, invitations, standees and social posts.",
            ],
          },
        ],
      },
      {
        heading: "When plans change",
        blocks: [
          "Rain, a new venue or a later start: change it in the dashboard and everyone who scans after that sees the new details, even from invitations printed weeks ago. " + EDIT_LATER,
        ],
      },
    ],
    faqs: [
      {
        q: "Can guests add the event to their calendar?",
        a: "Yes. The event page has Add to Google Calendar and Add to Apple / Outlook calendar buttons. The second downloads a standard .ics file that iPhone, Mac, Outlook and most calendar apps open.",
      },
      {
        q: "What if I don't set an end time?",
        a: "The end time is optional. Google Calendar entries then default to two hours long, and guests can change that in their own calendar.",
      },
      {
        q: "Can I change the venue after printing invitations?",
        a: "Yes. Edit the event in the dashboard and the printed code shows the new details from the next scan.",
      },
      {
        q: "Can people register through the QR code?",
        a: "Add your ticketing or registration link and the page shows a Tickets & registration button. To collect names and details yourself, use a feedback or lead form QR code.",
      },
    ],
    related: ["form", "image-gallery", "coupon"],
  },

  // ─── Form ───────────────────────────────────────────────────────────────────
  {
    slug: "form",
    editorKey: "form",
    label: "Feedback form",
    summary: "Collect feedback, leads and enquiries",
    title: "Feedback and Lead Form QR Code Generator",
    description: "Make a QR code that opens a short form: feedback, ratings, enquiries or leads. Get each response by email and download them all as CSV. No form tool needed.",
    h1: "Feedback and lead form QR code —",
    accent: "answers straight to your inbox",
    intro: "Build a short form in GenXQR, print the code, and collect feedback, ratings and enquiries from customers on their phones. No separate form tool or Google Form needed.",
    sections: [
      {
        heading: "What can the form ask?",
        blocks: [
          "Up to 15 questions, in any order, each marked required or optional:",
          {
            list: [
              "Short answer and long answer.",
              "Email and phone number, checked for a valid format.",
              "A 1–5 star rating.",
              "Multiple choice, with 2 to 20 options.",
            ],
          },
          "Add a title, a short introduction, your own button text and a thank-you message. You can choose the page's accent colour too.",
        ],
      },
      {
        heading: "Where the answers go",
        blocks: [
          {
            list: [
              "To your inbox: an email for each response if you leave \"Email me each response\" on. When a customer gives an email address, you can reply to the notification directly.",
              "To your dashboard, where you can read every response and download them all as a CSV for Excel or Google Sheets.",
              "To your own systems, through a webhook for each new response, on Pro and above.",
            ],
          },
          "Every form is protected against spam bots, and each code accepts up to 50,000 responses.",
        ],
      },
      {
        heading: "Ideas",
        blocks: [
          {
            list: [
              "Restaurant and hotel feedback: a rating plus \"What could we do better?\".",
              "Lead capture at exhibitions and real estate site visits: name, phone and budget.",
              "Service requests on equipment stickers: \"Report a problem\".",
              "Event and workshop feedback, before people leave the room.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I make a QR code for a feedback form?",
        a: "Create a dynamic code, choose Lead / Feedback Form, add your questions (short or long answer, email, phone, rating or multiple choice) and download the QR code. Customers scan it and fill the form in on their phone.",
      },
      {
        q: "How do I see the responses?",
        a: "In the code's page in your dashboard, and by email for each response if notifications are on. You can download all responses as a CSV file.",
      },
      {
        q: "Is it protected from spam?",
        a: "Yes. Every submission passes a bot check, answers are checked against your questions, and each network and each form are rate-limited.",
      },
      {
        q: "Can I use it instead of Google Forms?",
        a: "For short forms printed as QR codes, yes: it is built in, opens fast on phones, and the responses sit next to the scan analytics for the same code.",
      },
    ],
    related: ["google-review", "event", "vcard"],
  },

  // ─── Link in bio ────────────────────────────────────────────────────────────
  {
    slug: "link-in-bio",
    editorKey: "links",
    label: "Link-in-bio",
    summary: "Several links on one mobile page",
    title: "Link-in-Bio QR Code — All Your Links on One Page",
    description: "Make a link-in-bio QR code: one mobile page with buttons for your website, shop, booking page, YouTube and more. Add, remove or reorder links any time.",
    h1: "Link-in-bio QR code —",
    accent: "all your links on one page",
    intro: "One QR code, many destinations. Scanning opens a simple page with a button for each of your links: your shop, menu, booking page, latest video or anything else.",
    sections: [
      {
        heading: "What is a link-in-bio QR code?",
        blocks: [
          "When you have more than one place to send people, a single link isn't enough. A link-in-bio code opens a page with your title, a short bio and one big button per link, so people choose where to go.",
          "It works like the link pages creators use on Instagram, but it is yours, it sits behind a QR code you can print anywhere, and every scan is counted.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Start a dynamic code and choose Multi-Link.",
              "Enter a page title and an optional bio.",
              "Add your links, each with a button label and the address.",
              "Download the QR code and print or share it.",
            ],
          },
        ],
      },
      {
        heading: "Ideas",
        blocks: [
          {
            list: [
              "A shop: online store, WhatsApp orders, Google reviews and Instagram.",
              "A creator or speaker: YouTube, podcast, newsletter and booking page.",
              "An event: schedule, registration, venue map and live stream.",
              "A product: manual, warranty registration, support and reorder.",
            ],
          },
          "Add, remove or reorder links whenever you like. " + EDIT_LATER,
        ],
      },
    ],
    faqs: [
      {
        q: "How many links can I add?",
        a: "As many as you need. Each link is a button with your own label.",
      },
      {
        q: "Can I change the links after printing the QR code?",
        a: "Yes. Edit the page in the dashboard and the printed code shows the new links from the next scan.",
      },
      {
        q: "How is this different from a social media QR code?",
        a: "A link-in-bio page takes any links with your own button labels. A social media code is made for profiles: you pick the network and paste your profile link.",
      },
    ],
    related: ["social-media", "vcard", "business"],
  },

  // ─── Social media ───────────────────────────────────────────────────────────
  {
    slug: "social-media",
    editorKey: "social",
    label: "Social media",
    summary: "All your social profiles behind one code",
    title: "Social Media QR Code — All Your Profiles in One",
    description: "Make one QR code for all your social media: Instagram, Facebook, YouTube, LinkedIn, X, TikTok and more on one page, so people follow you where they like.",
    h1: "Social media QR code —",
    accent: "every profile behind one scan",
    intro: "Instead of a row of logos nobody can tap, print one code. Scanning it opens a page with a button for each of your social profiles.",
    sections: [
      {
        heading: "What is a social media QR code?",
        blocks: [
          "It opens a page with your name, a short bio and a button for each profile you add. Visitors follow you on whichever network they use, and you don't have to choose which one to print.",
          "Add up to 30 profiles from more than 30 networks, including Instagram, Facebook, YouTube, LinkedIn, X, TikTok, Snapchat, Pinterest, Threads, Telegram and your website.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Start a dynamic code and choose Social Media.",
              "Enter your name or brand and an optional bio.",
              "Add each network and paste your profile link.",
              "Download the code and put it where people meet you in person.",
            ],
          },
        ],
      },
      {
        heading: "Where it works best",
        blocks: [
          {
            list: [
              "Shop windows, counters, bags and packaging.",
              "Cafe tables, next to \"Tag us\".",
              "Business cards, flyers and event stalls.",
            ],
          },
          "Start a new channel or drop an old one and your printed code stays current. " + EDIT_LATER,
          "Only need one profile? Make a free [Instagram QR code](/generate/instagram) instead, or a [Facebook QR code](/qr-codes/facebook).",
        ],
      },
    ],
    faqs: [
      {
        q: "Which social networks can I add?",
        a: "More than 30, including Instagram, Facebook, YouTube, LinkedIn, X, TikTok, Snapchat, Pinterest, Threads, Telegram and a website link. You can add up to 30 profiles to one page.",
      },
      {
        q: "Can I add a new profile after printing?",
        a: "Yes. Add, change or remove profiles in the dashboard and the printed code shows the update from the next scan.",
      },
      {
        q: "Will it open the Instagram or YouTube app?",
        a: "Each button opens your profile link. On a phone with that app installed, Instagram, YouTube and most networks open the link in their app.",
      },
    ],
    related: ["link-in-bio", "facebook", "vcard"],
  },

  // ─── Image gallery ──────────────────────────────────────────────────────────
  {
    slug: "image-gallery",
    editorKey: "gallery",
    label: "Image gallery",
    summary: "A photo gallery people open with a scan",
    title: "Image Gallery QR Code — Share Photos with a Scan",
    description: "Make an image gallery QR code: upload photos and visitors see them in a mobile gallery, tapping any photo to view it full screen. Add photos any time.",
    h1: "Image gallery QR code —",
    accent: "share photos with a scan",
    intro: "Upload your photos and get a QR code that opens them as a gallery on any phone. Tap a photo to see it full screen.",
    sections: [
      {
        heading: "What is an image gallery QR code?",
        blocks: [
          "It opens a clean, mobile-friendly grid of your photos. Tapping any photo opens it full screen. Nobody needs to install anything or sign in, and your photos aren't buried in a social feed.",
          "Upload JPG, PNG or WEBP images, up to 10 MB each. Photos count towards your plan's storage.",
        ],
      },
      {
        heading: "Ideas",
        blocks: [
          {
            list: [
              "Real estate: interior photos on the board outside a property.",
              "Products: more angles and colours than the box can show.",
              "Portfolios: interiors, wedding photography, salons, tailoring.",
              "Weddings and events: share the day's photos with guests.",
              "Restaurants: photos of your dishes next to the menu.",
            ],
          },
        ],
      },
      {
        heading: "Keep it fresh",
        blocks: [
          "Add new photos after the event or the next shoot. " + EDIT_LATER,
          "Compress very large photos before uploading. They'll load faster on mobile data and look the same on a phone screen.",
        ],
      },
    ],
    faqs: [
      {
        q: "Which image formats can I upload?",
        a: "JPG, PNG and WEBP, up to 10 MB per image.",
      },
      {
        q: "Can I add more photos after printing?",
        a: "Yes. Upload more in the dashboard and they appear in the gallery from the next scan.",
      },
      {
        q: "Do visitors need an app to see the photos?",
        a: "No. The gallery opens in the phone's browser, and tapping a photo shows it full screen.",
      },
    ],
    related: ["pdf", "video", "event"],
  },

  // ─── Video ──────────────────────────────────────────────────────────────────
  {
    slug: "video",
    editorKey: "video",
    label: "Video",
    summary: "Play a video when the code is scanned",
    title: "Video QR Code Generator — Play a Video on Scan",
    description: "Make a video QR code: upload an MP4 or other video up to 250 MB and it plays on any phone when scanned. Product demos, tutorials and messages, no YouTube needed.",
    h1: "Video QR code generator —",
    accent: "play your video on scan",
    intro: "Upload a video and get a QR code that plays it on any phone. No YouTube channel, no ads before your video, and no suggested videos from other brands after it.",
    sections: [
      {
        heading: "What is a video QR code?",
        blocks: [
          "It opens a page that plays your video in the phone's own player, with a download button too. The file is stored by GenXQR, so you don't need to upload it to YouTube or anywhere else first.",
          "Upload MP4, WEBM, MOV, OGG or AVI files up to 250 MB. MP4 works on every phone, so it's the safest choice. Videos count towards your plan's storage.",
          "Already have the video on YouTube? Make a [free URL QR code](/generate/url) for the YouTube link instead.",
        ],
      },
      {
        heading: "Ideas",
        blocks: [
          {
            list: [
              "Product packaging: setup and how-to videos.",
              "Real estate: a walkthrough of the property.",
              "Print ads and brochures: a demo or testimonial.",
              "Gifts and wedding cards: a personal video message.",
              "Training: equipment instructions on the machine itself.",
            ],
          },
        ],
      },
      {
        heading: "Tips",
        blocks: [
          "Keep it short. Most people watch on mobile data, so a 1–2 minute video at 720p is quicker to start than a long 4K file. Add captions if people may watch with the sound off.",
          "Replace the video with a newer version any time. " + EDIT_LATER,
        ],
      },
    ],
    faqs: [
      {
        q: "Can I use a YouTube link for a video QR code?",
        a: "The video QR type plays a file you upload. For a YouTube video, make a URL QR code with the YouTube link; it's free on GenXQR's generator.",
      },
      {
        q: "How large can the video be?",
        a: "Up to 250 MB per file, in MP4, WEBM, MOV, OGG or AVI. MP4 plays on every phone.",
      },
      {
        q: "Can I swap the video after printing?",
        a: "Yes. Upload the new version in the dashboard and the printed code plays it from the next scan.",
      },
    ],
    related: ["mp3", "image-gallery", "pdf"],
  },

  // ─── MP3 / audio ────────────────────────────────────────────────────────────
  {
    slug: "mp3",
    editorKey: "mp3",
    label: "Audio",
    summary: "Play an MP3 or audio file on scan",
    title: "Audio QR Code Generator — Play an MP3 on Scan",
    description: "Make an audio QR code: upload an MP3 and it plays in a simple player on any phone. Audio guides, messages, music samples and announcements.",
    h1: "Audio QR code generator —",
    accent: "play an MP3 on scan",
    intro: "Upload an audio file and get a QR code that plays it on any phone, with a play button, a progress bar to skip through, and a download option.",
    sections: [
      {
        heading: "What is an audio QR code?",
        blocks: [
          "It opens a page with a simple audio player: play and pause, a progress bar to jump to any point, and a download link. Nothing to install and no streaming account needed.",
          "Upload MP3 files of up to 25 MB, which is roughly 25 minutes of good-quality speech. Audio files count towards your plan's storage.",
        ],
      },
      {
        heading: "Ideas",
        blocks: [
          {
            list: [
              "Museum, heritage and exhibition audio guides, with one code per exhibit.",
              "Messages in wedding cards, gifts and greeting cards.",
              "Music samples on posters, album sleeves and merchandise.",
              "Announcements and instructions in regional languages for people who prefer listening to reading.",
              "Podcast episodes and sermons on printed notices.",
            ],
          },
        ],
      },
      {
        heading: "Update the recording",
        blocks: [
          "Record a new version whenever the content changes. " + EDIT_LATER,
        ],
      },
    ],
    faqs: [
      {
        q: "What audio files can I upload?",
        a: "MP3 files up to 25 MB each.",
      },
      {
        q: "Does the listener need an app?",
        a: "No. The audio plays in the phone's browser, and there is a download link too.",
      },
      {
        q: "Can I replace the audio after printing?",
        a: "Yes. Upload a new file in the dashboard and the printed code plays it from the next scan.",
      },
    ],
    related: ["video", "pdf", "image-gallery"],
  },

  // ─── App download ───────────────────────────────────────────────────────────
  {
    slug: "app",
    editorKey: "app",
    label: "App download",
    summary: "One code for the App Store and Google Play",
    title: "App Download QR Code — App Store and Google Play",
    description: "Make one QR code for your app: scanning opens a page with App Store and Google Play buttons, so iPhone and Android users both find it. Track every scan.",
    h1: "App download QR code —",
    accent: "one code for iPhone and Android",
    intro: "Print one code for your app. Scanning opens a page with your app's name and description and buttons for the App Store and Google Play.",
    sections: [
      {
        heading: "What is an app download QR code?",
        blocks: [
          "An app is listed in two stores, but you only have room on a poster for one code. An app download code opens a small page with your app's name, a short description, and a button for each store you add. Users tap the one for their phone.",
          "Add only the store links you have: an Android-only app shows just the Google Play button.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Start a dynamic code and choose App Download.",
              "Enter the app name and an optional description.",
              "Paste your App Store link, your Google Play link, or both.",
              "Download the code for posters, packaging, receipts and in-store displays.",
            ],
          },
        ],
      },
      {
        heading: "Measure your offline installs",
        blocks: [
          "Every scan is recorded with its time, city and device, so you can see which poster, shop or campaign brings people to your app. Use a separate code for each location to compare them. " + EDIT_LATER,
        ],
      },
    ],
    faqs: [
      {
        q: "Can one QR code work for both iPhone and Android?",
        a: "Yes. The page shows an App Store button and a Google Play button, and people tap the one for their phone.",
      },
      {
        q: "What if my app is only on one store?",
        a: "Add only that store's link, and the page shows only that button.",
      },
      {
        q: "Can I see how many people scanned it, by device?",
        a: "Yes. Scan analytics show each scan's device type, operating system, browser, time and city.",
      },
    ],
    related: ["link-in-bio", "coupon", "video"],
  },

  // ─── Coupon ─────────────────────────────────────────────────────────────────
  {
    slug: "coupon",
    editorKey: "coupon",
    label: "Coupon",
    summary: "A discount code customers copy in one tap",
    title: "Coupon QR Code Generator — Digital Discount Codes",
    description: "Make a coupon QR code: customers scan to see your offer and copy the discount code in one tap. Show the validity date and terms, and change the offer any time.",
    h1: "Coupon QR code generator —",
    accent: "offers customers can copy in one tap",
    intro: "Print a code on a flyer, bill or bag. Scanning shows your offer, the discount code with a one-tap copy button, the validity date and your terms.",
    sections: [
      {
        heading: "What is a coupon QR code?",
        blocks: [
          "It opens a digital coupon: a title, the discount in large type, your coupon code, a \"Valid until\" date and your terms and conditions. Tapping the code copies it, ready to paste at your online checkout or show at the counter.",
          "After the validity date the coupon says it has expired. To stop the QR code opening it at all after a date, set an expiry on the code itself too, under its settings.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Start a dynamic code and choose Coupon.",
              "Enter the title, the discount (for example \"20% OFF\" or \"₹100 off\"), the code and the valid-until date.",
              "Add terms such as minimum order or one use per customer.",
              "Print it on flyers, bills, packaging or standees.",
            ],
          },
        ],
      },
      {
        heading: "Run better offers",
        blocks: [
          {
            list: [
              "Use one code per channel (flyer, bill, newspaper ad) to see which brings the most scans.",
              "Change the offer for the next season on the same printed material. " + EDIT_LATER,
              "Put a coupon on the bill to bring customers back, and a [Google review code](/qr-codes/google-review) next to it to collect reviews. Don't link the two: Google doesn't allow rewards for reviews.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do customers use a coupon QR code?",
        a: "They scan it, see your offer, tap the coupon code to copy it, and paste it at your online checkout or show the screen at your counter.",
      },
      {
        q: "Does the coupon expire automatically?",
        a: "After the valid-until date, the coupon page shows that the offer has expired. To stop the QR code opening the coupon at all, also set an expiry date on the code in its settings.",
      },
      {
        q: "Can I change the offer after printing?",
        a: "Yes. Edit the discount, code, date or terms in the dashboard and the printed QR code shows the new offer from the next scan.",
      },
    ],
    related: ["google-review", "event", "app"],
  },

  // ─── Facebook ───────────────────────────────────────────────────────────────
  {
    slug: "facebook",
    editorKey: "facebook",
    label: "Facebook",
    summary: "Send people to your Facebook page",
    title: "Facebook QR Code Generator — Link Your Page",
    description: "Make a Facebook QR code for your page or profile. Scanning opens a page with a button to visit you on Facebook. Track scans and change the link any time.",
    h1: "Facebook QR code generator —",
    accent: "bring people to your page",
    intro: "Print a code that sends people to your Facebook page or profile: on your shop window, flyers, packaging or business card.",
    sections: [
      {
        heading: "What is a Facebook QR code?",
        blocks: [
          "It opens a page showing your page name with a Visit Page on Facebook button. On a phone with Facebook installed, the link opens in the app, where people can like, follow or message you.",
          "Because it is dynamic, you see how many people scanned it, and you can point it at a new page if you rebrand.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Copy your Facebook page or profile address from the browser or the Share button.",
              "Start a dynamic code, choose Facebook and paste the address.",
              "Download the code and print it with a reason to follow, such as \"Offers every week on our page\".",
            ],
          },
          "Have several profiles? A [social media QR code](/qr-codes/social-media) puts them all behind one code.",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I make a QR code for my Facebook page?",
        a: "Copy your page's address, create a dynamic code, choose Facebook and paste it. Scanning opens a page with a button that takes people to your Facebook page.",
      },
      {
        q: "Can I change the Facebook link later?",
        a: "Yes. Update the address in the dashboard and the printed code uses it from the next scan.",
      },
      {
        q: "Does it work for Facebook groups and events?",
        a: "Paste any facebook.com address you want people to open, such as a page, profile, group or event.",
      },
    ],
    related: ["social-media", "link-in-bio", "business"],
  },

  // ─── Business page ──────────────────────────────────────────────────────────
  {
    slug: "business",
    editorKey: "business",
    label: "Business page",
    summary: "Opening hours, contact details and address",
    title: "Business Page QR Code — Hours, Contact, Address",
    description: "Make a business QR code that shows your opening hours, phone, email, website and address on one mobile page. Update your hours any time without reprinting.",
    h1: "Business page QR code —",
    accent: "your hours and contact details in one scan",
    intro: "Put your business information behind one code: what you do, when you're open, and how to call, email or find you.",
    sections: [
      {
        heading: "What does a business QR code show?",
        blocks: [
          {
            list: [
              "Your business name, category and a short description.",
              "Opening hours for each day of the week, with days you're closed marked.",
              "Your phone number and email, which people can tap to call or write.",
              "Your website and address.",
            ],
          },
        ],
      },
      {
        heading: "Where it helps",
        blocks: [
          {
            list: [
              "On the shutter or door, so people passing after hours know when to come back.",
              "On delivery bags and invoices, for repeat customers.",
              "On flyers and local newspaper ads.",
              "At clinics, salons, coaching centres and repair shops with changing hours.",
            ],
          },
        ],
      },
      {
        heading: "Holiday hours without reprinting",
        blocks: [
          "Closed for Diwali, or open late in the wedding season? Change the hours in the dashboard. " + EDIT_LATER,
        ],
      },
    ],
    faqs: [
      {
        q: "Can I show different hours for each day?",
        a: "Yes. Enter the hours for each day of the week; leave a day empty to show it as closed.",
      },
      {
        q: "Can I update my opening hours after printing?",
        a: "Yes. Edit them in the dashboard and the printed code shows the new hours from the next scan.",
      },
      {
        q: "How is this different from a vCard QR code?",
        a: "A business page shows your business: hours, description and contact details. A vCard is a person's contact card that saves into the phone's contacts.",
      },
    ],
    related: ["vcard", "google-review", "menu"],
  },
]

const BY_SLUG = new Map(QR_TYPE_PAGES.map((p) => [p.slug, p]))

export function qrTypePage(slug: string): QRTypePageContent | undefined {
  return BY_SLUG.get(slug)
}
