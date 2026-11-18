/**
 * The written part of each /generate/<type> page: a guide and FAQs that are
 * about THAT type. The pages used to share 93% of their text (only the title,
 * H1 and intro differed), so search engines saw five copies of one page, and
 * every one carried the same five FAQs.
 *
 * Rules for this file:
 * - Facts only. Every claim must hold for what the generator actually encodes
 *   (buildQRData in StaticGeneratePage.tsx): a WIFI: string, a wa.me link, an
 *   instagram.com link, a upi://pay link, an sms:, tel: or mailto: link, a
 *   vCard 3.0, a Google Maps search link, a YouTube link, plain text, or the
 *   URL as typed. Text is stored as UTF-8. Downloads are 600 px PNGs at
 *   error-correction level M.
 * - Links are written [text](/path) and rendered as internal links.
 * - The FAQs here are ALSO the page's FAQPage schema, so the visible answer and
 *   the structured data never disagree.
 */

export type GuideBlock = string | { list: string[] } | { steps: string[] }

export interface GuideSection {
  heading: string
  blocks: GuideBlock[]
}

export interface GeneratorGuide {
  /** Short name used in schema and breadcrumbs, e.g. "WiFi QR code generator". */
  name: string
  sections: GuideSection[]
  faqs: { q: string; a: string }[]
}

export type GuideType =
  | "url" | "wifi" | "whatsapp" | "instagram" | "upi" | "sms" | "phone"
  | "vcard" | "email" | "location" | "youtube" | "text"

export const GENERATOR_GUIDES: Record<GuideType, GeneratorGuide> = {
  // ─── URL ────────────────────────────────────────────────────────────────────
  url: {
    name: "URL QR code generator",
    sections: [
      {
        heading: "What is a URL QR code?",
        blocks: [
          "A URL QR code stores a web address. When someone points their phone camera at it, the phone shows the link and opens it in the browser with one tap. It is the most common kind of QR code: menus, product pages, sign-up forms, YouTube videos, Google Maps pins and online stores are all just links.",
          "The code made on this page holds your link directly inside the pattern. Nothing sits in between, so it works without an account, has no scan limit and does not expire. It keeps working for as long as the page it points to stays online.",
        ],
      },
      {
        heading: "How to make a QR code for a link",
        blocks: [
          {
            steps: [
              "Copy the full address of the page from your browser, including https://.",
              "Paste it into the URL field above. The preview updates as you type.",
              "Pick a dot colour that is clearly darker than the background, and a dot style if you like.",
              "Download the PNG and scan it with two different phones before you print it.",
            ],
          },
        ],
      },
      {
        heading: "Make the link short before you encode it",
        blocks: [
          "Every character of the link becomes part of the pattern. A long address full of tracking parameters makes a dense code with tiny squares, which is harder to scan when printed small or seen from a distance. If your link is very long, use the shortest version of the page that works, or use a dynamic QR code, which always encodes a short link however long the destination is.",
          "Check the link opens on a phone, not just on your computer. Pages that need a login, or that only work on desktop, frustrate people who just scanned your code.",
        ],
      },
      {
        heading: "When a URL code should be dynamic instead",
        blocks: [
          "A static code can never be changed. If the page moves, the campaign ends or you mistype the link, every printed copy is wrong and has to be reprinted. Choose a [dynamic QR code](/dynamic-qr) when:",
          {
            list: [
              "the code goes on something expensive to reprint: packaging, signage, vehicles, brochures",
              "the destination will change, such as a seasonal offer or a menu",
              "you want to know how many people scanned it, where and on which device",
            ],
          },
          "Dynamic codes come with every paid plan, from ₹299 a month, and you can try them free for 14 days. Read [dynamic vs static QR codes](/blog/dynamic-vs-static-qr-codes) for the full comparison.",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I turn a URL into a QR code?",
        a: "Copy the web address (URL) from your browser, paste it into the URL field on this page and download the PNG. Scanning the code opens that website. It's free, needs no account and works with any link: a website, a Google Maps pin, a YouTube video or a form.",
      },
      {
        q: "Does a URL QR code expire?",
        a: "No. The QR code made on this page holds the link itself, so the code never expires and has no scan limit. It stops being useful only if the web page it points to is taken down or moved.",
      },
      {
        q: "Can I change the link after printing the QR code?",
        a: "Not with a static code: the link is part of the pattern, so a new link means a new code. If you need to change the destination later, use a dynamic QR code, which points to a short GenXQR link that you can redirect at any time without reprinting.",
      },
      {
        q: "Why is my QR code so dense and hard to scan?",
        a: "Long links make dense codes, because every character is stored in the pattern. Shorten the link (remove tracking parameters you don't need), print the code larger, or use a dynamic QR code, which always encodes a short link.",
      },
      {
        q: "Can I track how many people scan my URL QR code?",
        a: "Not with a static code, because scans go straight to your website without passing through GenXQR. A dynamic QR code records every scan with the time, city, device and browser. You can also add UTM parameters to the link and see visits in Google Analytics.",
      },
      {
        q: "Will the QR code work on iPhone and Android?",
        a: "Yes. The built-in camera app on iPhone and on recent Android phones reads QR codes with links and offers to open them. Older Android phones can use Google Lens or any QR scanner app.",
      },
    ],
  },

  // ─── WiFi ───────────────────────────────────────────────────────────────────
  wifi: {
    name: "WiFi QR code generator",
    sections: [
      {
        heading: "What is a WiFi QR code?",
        blocks: [
          "A WiFi QR code stores your network name, password and security type in the standard WiFi format that phones understand. A guest scans it with their camera and the phone offers to join the network. Nobody has to read out or type a long password, and nobody gets it wrong.",
          "Cafes, restaurants, hotels, homestays, clinics, offices, co-working spaces and waiting rooms use them on table cards, reception desks and room doors. At home, a code on the fridge saves explaining the password to every visitor.",
        ],
      },
      {
        heading: "How to make a WiFi QR code",
        blocks: [
          {
            steps: [
              "Type the network name (SSID) exactly as it appears in your phone's WiFi list. Capital letters and spaces matter.",
              "Type the password exactly. Special characters are fine: the generator escapes them correctly.",
              "Choose the security type. Almost every router uses WPA/WPA2 (shown in router settings as WPA2-Personal or WPA2/WPA3). Choose None only for an open network.",
              "Download the PNG and test it: forget the network on your phone, scan the code, and check it connects.",
            ],
          },
        ],
      },
      {
        heading: "Which phones can scan it?",
        blocks: [
          {
            list: [
              "iPhone: the Camera app joins WiFi from a QR code on iOS 11 and later.",
              "Android: most phones on Android 10 and later connect from the camera or Google Lens, and many have a \"Scan QR code\" button in their WiFi settings.",
            ],
          },
          "A few older Android phones need a QR scanner app. If a guest's phone shows the network details but doesn't connect, they can still read the password from the screen.",
        ],
      },
      {
        heading: "Keep your network safe",
        blocks: [
          "Anyone who can see the code can join your WiFi, and the password can be read by scanning it. For a business, put the code on a separate guest network, not the one your billing computer, cameras or office printers use. Most routers have a guest network option.",
          "The password is stored in the code, so if you change your WiFi password you need a new code. Make it now, print it again, and take the old ones down.",
        ],
      },
      {
        heading: "Printing tips",
        blocks: [
          "On a table card or tent, print the code at least 3 cm wide, with the words \"Scan to join our WiFi\" and the network name next to it, so guests know what it is for. Laminate cards that will be handled often. Our [print checklist](/blog/qr-codes-that-scan-print-checklist) covers size, contrast and finish.",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I connect to WiFi by scanning a QR code?",
        a: "Open the camera on your phone and point it at the code. When a notification or button appears saying \"Join network\" or \"Connect\", tap it. iPhones on iOS 11 and later and Android phones on Android 10 and later do this from the camera; on other phones use Google Lens or the \"Scan QR code\" option in WiFi settings.",
      },
      {
        q: "Is it safe to share WiFi with a QR code?",
        a: "It is as safe as telling someone the password, because the password is stored in the code and anyone who scans it can join. For a shop, cafe or office, put the code on a separate guest network so visitors can't reach your own devices.",
      },
      {
        q: "What happens to the QR code if I change my WiFi password?",
        a: "It stops working, because the old password is stored in the code. Make a new code with the new password and replace the printed copies.",
      },
      {
        q: "Which security type should I choose?",
        a: "Choose WPA/WPA2 for almost every modern router, including routers set to WPA2-Personal or WPA2/WPA3 mixed mode. Choose WEP only if your router is very old and set to WEP, and None only for a network with no password.",
      },
      {
        q: "Can a WiFi QR code work for a hidden network?",
        a: "The code made here is for networks that broadcast their name, which is how almost every home and business router is set up. If your network is hidden, guests may need to add it manually in their WiFi settings.",
      },
    ],
  },

  // ─── WhatsApp ───────────────────────────────────────────────────────────────
  whatsapp: {
    name: "WhatsApp QR code generator",
    sections: [
      {
        heading: "What is a WhatsApp QR code?",
        blocks: [
          "A WhatsApp QR code opens a chat with your number when someone scans it, with a message already typed if you add one. The customer doesn't have to save your number first. It is the quickest way to get enquiries, orders and bookings from print into WhatsApp.",
          "The code holds a standard wa.me link, WhatsApp's own click-to-chat address, so it works with ordinary WhatsApp and with WhatsApp Business.",
        ],
      },
      {
        heading: "How to make a WhatsApp QR code",
        blocks: [
          {
            steps: [
              "Enter your WhatsApp number with the country code, for example +91 98765 43210 for India. Don't start with 0: the country code replaces it.",
              "Add a message if you want one, such as \"Hi, I'd like to order\" or \"Booking enquiry from your flyer\". The customer can still edit it before sending.",
              "Choose your colours and download the PNG.",
              "Scan it from a phone that isn't yours and check the chat opens with your number.",
            ],
          },
        ],
      },
      {
        heading: "Where businesses use WhatsApp QR codes",
        blocks: [
          {
            list: [
              "Shop counters and bills: \"Order on WhatsApp next time\".",
              "Restaurant tables and takeaway bags, for repeat orders and table bookings.",
              "Visiting cards and flyers, so a prospect messages you instead of calling at a bad time.",
              "Product packaging and delivery boxes, for support and reorders.",
              "Real estate boards and event standees, for enquiries.",
            ],
          },
          "Use a different pre-filled message on each item, such as \"Hi from the Diwali flyer\". When chats arrive you can see which print brought them in.",
        ],
      },
      {
        heading: "If you might change your number",
        blocks: [
          "Your number is stored in the code, so a new number means a new code. If the code goes on packaging, a shop board or anything you print in large quantities, a [dynamic QR code](/dynamic-qr) lets you point it to a new number later and shows how many people scanned it.",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I make a QR code for my WhatsApp number?",
        a: "Choose WhatsApp above, enter your number with the country code (for example +91 98765 43210), optionally add a message, and download the PNG. When someone scans it, WhatsApp opens a chat with your number.",
      },
      {
        q: "Does a WhatsApp QR code work with WhatsApp Business?",
        a: "Yes. The code opens a wa.me link, which works with any WhatsApp number, including WhatsApp Business accounts.",
      },
      {
        q: "Does the pre-filled message send automatically?",
        a: "No. The message is typed into the chat for the customer, and they tap Send themselves. They can edit or delete it first.",
      },
      {
        q: "What if the person scanning doesn't have WhatsApp?",
        a: "The wa.me link opens a WhatsApp web page that asks them to install WhatsApp or continue in WhatsApp Web. Put your phone number in text next to the code for anyone who prefers to call.",
      },
      {
        q: "Is this the same as the QR code inside WhatsApp?",
        a: "It does the same job. WhatsApp's own share code can be reset, which stops old printed copies working; a wa.me code made here always opens a chat with the number you entered.",
      },
    ],
  },

  // ─── Instagram ──────────────────────────────────────────────────────────────
  instagram: {
    name: "Instagram QR code generator",
    sections: [
      {
        heading: "What is an Instagram QR code?",
        blocks: [
          "An Instagram QR code opens your Instagram profile when scanned. On a phone with Instagram installed it usually opens in the app, ready for the visitor to tap Follow; otherwise it opens your profile on instagram.com.",
          "It is the simplest way to turn people who see your shop, product or stall in person into followers you can reach again.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Enter your Instagram username without the @, exactly as it appears on your profile.",
              "Pick colours that suit your brand, keeping the dots darker than the background.",
              "Download the PNG and scan it to check it opens the right profile.",
            ],
          },
        ],
      },
      {
        heading: "Where to put it",
        blocks: [
          {
            list: [
              "Shop windows, counters and trial rooms.",
              "Product tags, packaging and thank-you cards in orders.",
              "Cafe tables and menus, next to \"Tag us in your photos\".",
              "Event standees, stalls and exhibition booths.",
            ],
          },
          "Tell people why to follow: new arrivals, offers or behind-the-scenes. A code with a reason gets scanned far more than a bare logo.",
        ],
      },
      {
        heading: "If you change your username",
        blocks: [
          "The username is stored in the code, so if you rename your account, printed codes will stop finding you. If you're likely to rebrand, or want to send people to a link page with several profiles, use a [dynamic QR code](/dynamic-qr) that you can update later.",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I create a QR code for my Instagram page or profile?",
        a: "Choose Instagram above, enter your username without the @, and download the PNG. Scanning it opens your profile, in the Instagram app if it's installed.",
      },
      {
        q: "Is this different from Instagram's own QR code?",
        a: "Instagram's built-in code in the app also opens your profile. A code made here is a plain image in your choice of colours and dot style, ready to place on any print design.",
      },
      {
        q: "Will it still work if I change my Instagram username?",
        a: "No. The username is stored in the code, so a new username needs a new code. A dynamic QR code lets you change where the code points without reprinting.",
      },
      {
        q: "Can I link to a single post or reel instead of my profile?",
        a: "Yes: copy the post's link from Instagram (Share → Copy link) and make a URL QR code with it instead.",
      },
    ],
  },

  // ─── UPI ────────────────────────────────────────────────────────────────────
  upi: {
    name: "UPI QR code generator",
    sections: [
      {
        heading: "What is a UPI QR code?",
        blocks: [
          "A UPI QR code holds a standard UPI payment link with your UPI ID (also called a VPA, like yourshop@okhdfcbank), the name payments go to and, if you choose, a fixed amount and a short note. When a customer scans it in Google Pay, PhonePe, Paytm, BHIM or their bank's app, your details are filled in for them and they only confirm and enter their UPI PIN.",
          "The money goes straight from the customer's bank to the account linked to your UPI ID. GenXQR never touches the payment and charges nothing for it.",
        ],
      },
      {
        heading: "How to make a UPI QR code",
        blocks: [
          {
            steps: [
              "Enter your UPI ID exactly. You'll find it in your UPI app's profile.",
              "Enter the name payments go to, usually your shop or business name.",
              "Leave the amount empty for a shop counter, so customers type what they owe. Set an amount only for one fixed price, such as a ticket or a fee.",
              "Add a note if you want one, such as an invoice number. Customers see it in their app.",
              "Download the PNG, then make a ₹1 test payment from a different phone and check the name that appears.",
            ],
          },
        ],
      },
      {
        heading: "Scanning: UPI app or camera?",
        blocks: [
          "Customers at a counter usually scan with the Scan & Pay button inside their UPI app, and that is what this code is made for: every UPI app reads it.",
          "Phone cameras handle UPI links differently. Android usually offers to open a UPI app; an iPhone opens whichever app has claimed UPI links, which isn't always the customer's payment app. For posters, flyers and invoices that people scan with their camera, a UPI payment page works better. It is a page with a Pay button for each app. Read [which kind of UPI code to print where](/blog/upi-qr-code-for-your-shop).",
        ],
      },
      {
        heading: "Protect your customers and yourself",
        blocks: [
          {
            list: [
              "Print your business name next to the code, so customers can check it matches the name their app shows before they pay.",
              "Check your counter code now and then. Fraudsters sometimes stick their own code over a shop's.",
              "If you collect payments as a business, ask your bank or UPI app for a business (merchant) UPI ID, which shows your business name to customers.",
              "Scanning a UPI code is only ever for paying. Nobody needs to scan a code or enter a PIN to receive money, so tell staff never to do that for a \"refund\".",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Is this UPI QR code generator free?",
        a: "Yes. Making and downloading the code is free, with no account. Payments go directly to your UPI ID, and GenXQR charges nothing on them because it is not involved in the payment at all.",
      },
      {
        q: "Which apps can scan this UPI QR code?",
        a: "Any UPI app: Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, WhatsApp Pay and bank apps that support UPI. The code holds the standard upi://pay link those apps read.",
      },
      {
        q: "Can I set a fixed amount on the UPI QR code?",
        a: "Yes. Enter the amount (up to 2 decimals) and customers see it filled in. Leave it empty for a shop counter, where every bill is different, so customers type the amount themselves.",
      },
      {
        q: "Can I change my UPI ID on a printed QR code?",
        a: "Not on this code: your UPI ID is stored in the pattern, so a new UPI ID means a new code. A dynamic UPI payment page from GenXQR can be edited after printing and shows how many people scanned it.",
      },
      {
        q: "Why doesn't my iPhone camera open the right UPI app?",
        a: "iPhones have no \"choose an app\" menu for UPI links, so the camera opens whichever app claimed them, sometimes not a payment app. Customers should scan from inside their UPI app. For printed marketing scanned by camera, use a UPI payment page, which shows a button for each app.",
      },
      {
        q: "How do I check my UPI QR code is right before printing?",
        a: "Scan it from a different phone, check the payee name shown is yours, and send yourself ₹1. If the name or UPI ID is wrong, fix it and download again before you print.",
      },
    ],
  },

  // ─── SMS ────────────────────────────────────────────────────────────────────
  sms: {
    name: "SMS QR code generator",
    sections: [
      {
        heading: "What is an SMS QR code?",
        blocks: [
          "An SMS QR code opens the phone's messaging app with your number and, if you add one, a message already typed. The person scanning only has to tap Send. It suits enquiries, keyword sign-ups (\"Text JOIN to…\"), feedback and support requests from people who'd rather not install anything.",
          "Because it uses ordinary SMS, it works on any phone with a messaging app, with or without mobile data. The sender pays their normal SMS rate.",
        ],
      },
      {
        heading: "How to make an SMS QR code",
        blocks: [
          {
            steps: [
              "Enter the number messages should go to, with the country code (for example +91 98765 43210).",
              "Type the message you want pre-filled, such as \"INFO\" or \"Please call me back about the 2BHK\".",
              "Download the PNG, then scan it from another phone and check the message app opens with both filled in.",
            ],
          },
        ],
      },
      {
        heading: "SMS or WhatsApp?",
        blocks: [
          "Most people in India reply faster on WhatsApp, and WhatsApp lets you send photos and catalogues back. Choose a [WhatsApp QR code](/generate/whatsapp) for customer conversations. Choose SMS when the number isn't on WhatsApp, when you use an SMS keyword or shortcode system, or when your audience may not have data.",
        ],
      },
    ],
    faqs: [
      {
        q: "Does an SMS QR code send the message automatically?",
        a: "No. It opens the messaging app with the number and message filled in, and the person taps Send. Phones never send an SMS from a QR code without the user confirming.",
      },
      {
        q: "Does scanning an SMS QR code cost money?",
        a: "Scanning is free. Sending the message costs whatever the sender's mobile plan charges for an SMS; many Indian plans include free SMS.",
      },
      {
        q: "Will the pre-filled message work on iPhone and Android?",
        a: "Yes, on both. A few older or unusual messaging apps open the number but ignore the message; the person can still type it.",
      },
    ],
  },

  // ─── Phone ──────────────────────────────────────────────────────────────────
  phone: {
    name: "Phone call QR code generator",
    sections: [
      {
        heading: "What is a phone QR code?",
        blocks: [
          "A phone QR code opens the phone's dialler with your number already entered, so the caller just taps the call button. Nobody misdials, and nobody has to type a number from a poster across the street.",
          "It is useful on property boards, vehicle signage, service stickers on appliances, clinic and pharmacy notices, and anywhere a call is the next step.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Enter the number with the country code (for example +91 98765 43210), or a landline with its STD code.",
              "Download the PNG and scan it from another phone to check the right number appears.",
            ],
          },
          "Print the number in text next to the code too: some people prefer to dial it themselves, and it reassures them they're calling the right place.",
        ],
      },
      {
        heading: "Calls, chats and contact cards",
        blocks: [
          "If you also want people to save your details, a [vCard (contact card) QR code](/generate/vcard) adds your name, number, email and address to their contacts in one tap. If most customers message rather than call, use a [WhatsApp QR code](/generate/whatsapp).",
        ],
      },
    ],
    faqs: [
      {
        q: "Does a phone QR code call the number automatically?",
        a: "No. It opens the dialler with the number filled in, and the person taps Call. Phones always ask before placing a call from a QR code.",
      },
      {
        q: "Can I use a landline or toll-free number?",
        a: "Yes. Enter any number with its country code, including landlines with the STD code and toll-free numbers.",
      },
      {
        q: "What if I change my number later?",
        a: "The number is stored in the code, so a new number needs a new code. If the code goes on signage or vehicles, a dynamic QR code can be updated without reprinting.",
      },
    ],
  },

  // ─── vCard ──────────────────────────────────────────────────────────────────
  vcard: {
    name: "vCard QR code generator",
    sections: [
      {
        heading: "What is a vCard QR code?",
        blocks: [
          "A vCard QR code is a contact card inside a QR code. When someone scans it with their phone camera, the phone offers to add a new contact with your name, number, email, company and the other details you entered already filled in. Nobody has to type your number from a business card or spell your email back to you.",
          "The code made on this page holds the vCard itself (the standard vCard 3.0 format that phones' contact apps read), so it works without an account and without the internet, and it never expires.",
        ],
      },
      {
        heading: "How to make a contact QR code",
        blocks: [
          {
            steps: [
              "Enter your first and last name, and your mobile number with the country code (for example +91 98765 43210).",
              "Add your email, and your company, job title, website and address if they help people reach you.",
              "Download the PNG, then scan it with an iPhone and an Android phone and check every detail comes through correctly.",
            ],
          },
          "Names and addresses in Hindi or other Indian scripts work too: the text is stored as UTF-8, which phone scanners read.",
        ],
      },
      {
        heading: "Where to use it",
        blocks: [
          {
            list: [
              "On the back of a business card, so the card and the contact can't get separated",
              "On a name badge or lanyard at a conference or trade show",
              "On a shop counter, a delivery van or a property board, for people who want to save you for later",
              "In an email signature or a PDF brochure, as an image people can scan from a screen",
            ],
          },
        ],
      },
      {
        heading: "Keep it short, or make it editable",
        blocks: [
          "Every detail is stored in the pattern, so a card with a long address, two phone numbers and a long website makes a dense code that is harder to scan when printed small. Include what people actually need, and print the code at least 2.5 cm wide.",
          "A static contact card can't be changed: a new number or job means a new code and new cards. A [dynamic vCard code](/qr-codes/vcard) shows a contact page you can edit at any time, with a photo and links, and counts every scan.",
        ],
      },
    ],
    faqs: [
      {
        q: "What happens when someone scans a vCard QR code?",
        a: "Their phone shows your contact details and offers to add you as a new contact. On iPhone, the camera shows a contact banner; on Android, the camera or Google Lens offers to add the contact. They tap once and every field is saved.",
      },
      {
        q: "Does a vCard QR code need the internet?",
        a: "No. The contact details are stored in the code itself, so scanning and saving the contact works offline. Only links in the card, such as your website, need the internet when someone opens them.",
      },
      {
        q: "Can I update my details after printing?",
        a: "Not with a static code: the details are part of the pattern. If your number or job may change, use a dynamic vCard code, which points to a contact page you can edit without reprinting.",
      },
      {
        q: "Can I add a photo to the contact card?",
        a: "Not in this free code. A photo would make the code far too dense to scan. The dynamic vCard page in the GenXQR dashboard can show a photo, because the code only holds a short link.",
      },
      {
        q: "Why won't my contact QR code scan?",
        a: "Usually because it holds too many details for its printed size. Remove fields people don't need, shorten the address, print it larger, and keep the dots much darker than the background.",
      },
    ],
  },

  // ─── Email ──────────────────────────────────────────────────────────────────
  email: {
    name: "email QR code generator",
    sections: [
      {
        heading: "What is an email QR code?",
        blocks: [
          "An email QR code opens a new email in the phone's mail app, addressed to you, with a subject and message already written if you add them. The person scanning reads it over, adds anything they want and taps Send.",
          "It suits enquiry posters, product registration, feedback cards, job notices (\"email your CV\") and support labels, where you want the message to reach the right inbox with a subject you can filter on.",
        ],
      },
      {
        heading: "How to make an email QR code",
        blocks: [
          {
            steps: [
              "Enter the email address messages should go to.",
              "Add a subject such as \"Enquiry: Diwali hampers\" so you can tell where the email came from.",
              "Optionally write the start of the message, then download the PNG and test it on a phone with a mail app set up.",
            ],
          },
        ],
      },
      {
        heading: "Things to know",
        blocks: [
          {
            list: [
              "Scanning never sends the email by itself: the person always taps Send.",
              "It needs a mail app on the phone with an account signed in. Most phones have one, but if your audience mostly uses WhatsApp, a [WhatsApp QR code](/generate/whatsapp) may get more replies.",
              "Keep the message short. Every character is stored in the code, and a long message makes it dense.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Does an email QR code send the email automatically?",
        a: "No. It opens the email app with your address, subject and message filled in, and the person taps Send. Phones never send an email from a QR code without the user confirming.",
      },
      {
        q: "Which email app opens when someone scans it?",
        a: "Whichever mail app the phone uses by default, such as Gmail or Apple Mail. The code holds a standard mailto: link, which every phone understands.",
      },
      {
        q: "Can I tell which emails came from the QR code?",
        a: "Yes, if you use a subject only the QR code uses, such as \"Enquiry from shop poster\". Filter or search your inbox for it.",
      },
      {
        q: "Can I change the email address after printing?",
        a: "No. The address is stored in the code, so a new address needs a new code. If the code goes on something expensive to reprint, use a dynamic QR code that you can point somewhere else later.",
      },
    ],
  },

  // ─── Location ───────────────────────────────────────────────────────────────
  location: {
    name: "location QR code generator",
    sections: [
      {
        heading: "What is a location QR code?",
        blocks: [
          "A location QR code opens a place in Google Maps. People scan it on a flyer, invitation or signboard and get the map and directions straight away, instead of typing an address into their phone and hoping they spelled it right.",
          "The code made on this page holds a Google Maps link. It opens the Google Maps app if the phone has it, or Google Maps in the browser if not, on iPhone and Android.",
        ],
      },
      {
        heading: "How to make a QR code for a location",
        blocks: [
          {
            steps: [
              "Enter the place the way you'd search for it in Google Maps: a business name with its area (\"Café Kesar, Hauz Khas Village\"), or a full address.",
              "For an exact spot, such as a gate, a stall or a farmhouse with no address, use coordinates instead (for example 28.6129, 77.2295) or paste the link from Google Maps → Share.",
              "Download the PNG, scan it and check the map lands on the right place before you print.",
            ],
          },
        ],
      },
      {
        heading: "Address, coordinates or a Maps link?",
        blocks: [
          {
            list: [
              "A name or address is searched in Google Maps when scanned. It is best for businesses Google already knows, because people also see your reviews, photos and opening hours.",
              "Coordinates drop a pin at that exact point. Use them for venues, gates, parking and places without a clear address.",
              "A link copied from Google Maps → Share opens exactly what you shared, and is the simplest choice if you already have it.",
            ],
          },
          "Want people to leave a review once they've visited? Use a [Google review QR code](/qr-codes/google-review) for that.",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I make a QR code for my Google Maps location?",
        a: "Open your place in Google Maps, tap Share and copy the link, then paste it into the field on this page. You can also type the place name and area, an address, or coordinates. Download the PNG and test it before printing.",
      },
      {
        q: "Does it work on iPhone?",
        a: "Yes. The code holds a Google Maps web link, which opens the Google Maps app if it's installed and Google Maps in Safari if not. People can get directions from either.",
      },
      {
        q: "Why does my QR code open the wrong place?",
        a: "A name or address is searched when scanned, and a vague one can match somewhere else. Add the area and city, or use coordinates or a link from Google Maps → Share for an exact pin.",
      },
      {
        q: "Can I use this on wedding cards and event invitations?",
        a: "Yes. Use the venue's Google Maps link or its coordinates so guests land at the right gate, and print the code at least 2 cm wide.",
      },
    ],
  },

  // ─── YouTube ────────────────────────────────────────────────────────────────
  youtube: {
    name: "YouTube QR code generator",
    sections: [
      {
        heading: "What is a YouTube QR code?",
        blocks: [
          "A YouTube QR code opens a video, Short, playlist or channel when scanned. On most phones it opens in the YouTube app if it's installed, or on youtube.com in the browser if not.",
          "Use it to turn print into views: a product demo on the box, a recipe video on a menu card, a channel link on a shop poster, or a wedding film on the invitation's thank-you card.",
        ],
      },
      {
        heading: "How to make a QR code for a YouTube video",
        blocks: [
          {
            steps: [
              "On YouTube, tap Share under the video (or on the channel page) and copy the link.",
              "Paste it into the field on this page. You can also type a channel's @handle, or an 11-character video ID.",
              "Download the PNG and scan it to check the right video opens.",
            ],
          },
          "Want the video to start at a certain moment? On a computer, YouTube's Share box has a \"Start at\" option; copy that link and the start time stays in it.",
        ],
      },
      {
        heading: "Video or channel?",
        blocks: [
          "Link a single video when the print is about one thing, like a product or an event. Link your channel when you want subscribers, so the code stays useful as you post new videos. A static code can't be switched from one video to another later; if you'll want to change it, use a [dynamic QR code](/dynamic-qr).",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I make a QR code for a YouTube video?",
        a: "Copy the video's link from YouTube's Share button, paste it into this page and download the PNG. Scanning the code opens the video on YouTube.",
      },
      {
        q: "Will it open in the YouTube app?",
        a: "Usually, yes. YouTube links open in the YouTube app when it's installed on iPhone and Android; otherwise they open on youtube.com in the browser.",
      },
      {
        q: "Can I link to my channel instead of a video?",
        a: "Yes. Paste your channel's link or just type its @handle, and the code opens your channel page.",
      },
      {
        q: "Can I see how many people scanned it?",
        a: "Not with a static code, because it goes straight to YouTube. YouTube Studio shows views but can't tell which came from your QR code. A dynamic QR code counts every scan, with the city and device.",
      },
    ],
  },

  // ─── Text ───────────────────────────────────────────────────────────────────
  text: {
    name: "text QR code generator",
    sections: [
      {
        heading: "What is a text QR code?",
        blocks: [
          "A text QR code holds a short message. When scanned, the phone shows the text itself: no website opens and no internet connection is needed, because the message is stored in the code.",
          "It suits instructions on equipment, a gate or Wi-Fi note for guests, a code for a treasure hunt, serial numbers and asset labels, or a short message on a gift.",
        ],
      },
      {
        heading: "How to make one",
        blocks: [
          {
            steps: [
              "Type or paste your message. Hindi and other Indian scripts work: the text is stored as UTF-8, which phone scanners read.",
              "Keep it short. The page warns you when the text is long enough to make a dense code.",
              "Download the PNG and scan it with two phones to check the text shows up in full.",
            ],
          },
        ],
      },
      {
        heading: "Good to know",
        blocks: [
          {
            list: [
              "How the text appears depends on the scanner: most show it with a copy button, and some offer to search the web for it.",
              "Anything you put in the code can be read by anyone who scans it. Don't store passwords or private details you wouldn't print in plain sight.",
              "To share a link, a Wi-Fi network or a contact, use the matching type instead ([URL](/generate/url), [WiFi](/generate/wifi), [contact card](/generate/vcard)): phones act on those with one tap, while plain text only shows.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Does a text QR code need the internet?",
        a: "No. The text is stored in the code, so the phone shows it without connecting to anything.",
      },
      {
        q: "How much text can a QR code hold?",
        a: "In theory a few thousand characters, but long text makes a dense code that is hard to scan when printed. Keep it to a few sentences, and print it larger if it's long.",
      },
      {
        q: "Can I write in Hindi or other languages?",
        a: "Yes. The text is stored as UTF-8, so Hindi, Tamil, Bengali and other scripts, accented letters and symbols like ₹ show correctly on modern phones.",
      },
      {
        q: "What does someone see when they scan it?",
        a: "The text itself. How it is shown depends on the scanner: most show it with an option to copy it, and some offer to search the web for it.",
      },
    ],
  },
}
