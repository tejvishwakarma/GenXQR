---
title: Dynamic vs static QR codes: which one should you print?
description: Static QR codes are free and fixed forever. Dynamic ones can be edited after printing and show who scans. Here is how to choose, with a simple rule of thumb.
category: Guides
date: 2026-11-10
featured: true
---

Every QR code is a picture of some text. The question is what that text is, because it decides what you can change after the code is printed.

## Static QR codes: the data is in the picture

A static QR code holds its content directly: a web address, a Wi-Fi password, a UPI payment link, a phone number. Scan it and the phone reads that content straight from the black and white squares. No server is involved.

That has real advantages:

- **It is free and needs no account.** GenXQR's [free QR code generator](/generate) makes static codes for links, Wi-Fi, WhatsApp, Instagram, UPI, SMS and phone calls without signing up.
- **It never depends on anyone.** No subscription, no company that has to stay in business. As long as the content is still valid, the code keeps working.
- **It works offline** for things like Wi-Fi details, which the phone reads without going online.

And one big disadvantage: **it can never change.** If the link moves, the menu gets a new address or the Wi-Fi password is reset, every printed copy is now wrong. The only fix is to print again.

Static codes also tell you nothing. You will never know how many people scanned your poster.

## Dynamic QR codes: the picture holds a short link

A dynamic QR code holds a short address, such as `genxqr.com/r/k3x9pQ2a`. When someone scans it, that address forwards them to wherever you have set it to go right now. You change the destination in your dashboard, and the printed code follows.

Because every scan passes through that short link, a dynamic code can also:

- **Show you the scans:** when people scanned, the city and country (worked out from the internet connection), and whether they used a phone, tablet or computer, with the operating system and browser. See [scan analytics](/features).
- **Be paused or scheduled.** Turn a code off when an offer ends, or set it to start working on a launch date and stop on a closing date.
- **Open a page instead of a link.** A [menu](/qr-codes/menu), a [business card](/qr-codes/vcard), a [PDF](/qr-codes/pdf), a list of links, a payment page, a feedback form: GenXQR hosts the page, so you don't need a website. See [every type of dynamic code](/qr-codes).
- **Send different people to different places,** by device, country, time of day or phone language, on plans with [smart routing](/dynamic-qr).

The short link also makes the code less dense, with fewer, bigger squares, which helps it scan from further away and in poor light.

## Why "less dense" matters more than it sounds

A QR code grows a finer grid as it holds more text. A long web address with tracking tags (`?utm_source=…&utm_campaign=…`) can easily run past 100 characters; a dynamic code's short link stays the same length whatever the destination is. At the same printed size, fewer squares means each square is bigger, and bigger squares are what a phone camera needs from across a room, through a shop window or in dim light.

It also means the code looks the same whatever you put behind it. You can start with a link to your website, switch it to a menu page next month and to a festival offer after that, and the printed pattern never changes.

## The catch with dynamic codes

A dynamic code only works while the service behind it does. If you stop paying, it stops forwarding. On GenXQR, when a plan or trial ends, dynamic codes are paused and show a "this code is not active" page (or a fallback address you choose). They start working again, unchanged, as soon as you renew. Nothing needs reprinting, but you do need the plan to keep them live.

Your scan history is kept while the plan is live and for three months after an account drops to the free plan, so a short gap in renewing doesn't wipe your numbers.

That is the honest trade-off: static codes are free forever but frozen; dynamic codes are flexible and measurable but need a subscription.

### Can I make the dependence smaller?

Two things help:

- **Set a fallback address** on codes that matter. If a code is ever paused (an offer that has ended, a scan limit reached, a plan that lapsed), scanners go to that address instead of an error page.
- **Use your own domain.** From the Pro plan, codes can print as your own address, such as `qr.yourbrand.com/r/…`, instead of genxqr.com. The domain stays yours.

## A rule of thumb

**If it goes on paper that you can't easily reprint, use a dynamic code.** Flyers, packaging, table cards, shop windows, visiting cards, banners, product labels. The day the link changes, you will be glad you can fix it from your phone.

**Use a static code when the content will never change** and you don't need to count scans:

- Your home Wi-Fi password on the fridge
- Your own UPI ID at the shop counter (UPI apps' built-in scanners read static UPI codes directly; see our [guide to UPI QR codes](/blog/upi-qr-code-for-your-shop))
- A one-off event that is over before anything could change

## Examples: which kind for which job

| Where the code goes | Better choice | Why |
| --- | --- | --- |
| Restaurant table card | Dynamic | Prices and dishes change; see [QR menus](/blog/qr-code-menu-for-restaurants) |
| Shop counter, paid from a UPI app | Static UPI | UPI apps' scanners only read direct UPI codes |
| Poster or flyer for an offer | Dynamic | Pause it when the offer ends; count scans per poster |
| Product packaging | Dynamic | Thousands of printed boxes outlive any single link |
| Visiting card | Dynamic | A new phone number or job title doesn't mean new cards |
| Guest Wi-Fi at home | Static | The password rarely changes and needs no tracking |
| Review standee at reception | Dynamic | Count scans; see [Google review QR codes](/blog/google-review-qr-code) |
| Wedding invitation | Either | Static is fine if the venue and date are final |

## Common mistakes

- **Printing a static code to a link you don't control.** A static code to a file on a cloud drive, a page on a website you might rebuild, or a social post you might delete breaks the day that link does.
- **Not checking what a free dynamic code costs to keep.** Free dynamic plans come with conditions: QR TIGER's free plan, for example, allows 500 scans on each of its 3 dynamic codes and shows a QR TIGER pop-up when they are scanned (see [our comparison](/compare/qr-tiger)). Before printing a dynamic code anywhere, know what you will pay to keep it running. GenXQR's prices are on the [pricing page](/pricing), and we have compared ours with [other QR code makers](/compare).
- **Making a new code for every change.** With a dynamic code you edit the destination; the old code keeps working. A new code is only needed for a new spot you want to count separately, such as a second branch.
- **Not testing after an edit.** After changing where a dynamic code goes, scan it once yourself to check the new destination.

## Quick comparison

| | Static | Dynamic |
| --- | --- | --- |
| Cost | Free | Paid plan (14-day free trial) |
| Change after printing | No | Yes, any time |
| Scan counts and locations | No | Yes |
| Hosted pages (menu, PDF, vCard) | No | Yes |
| Pause, schedule or set a scan limit | No | Yes |
| Works if you stop paying | Yes | No, paused until renewed |
| Pattern density | Grows with the content | Always a short link |

## Frequently asked questions

**Can I turn a static code into a dynamic one?** No. The content of a static code is the picture itself, so there is nothing to edit. Make a dynamic code and replace the printed one.

**Do dynamic codes expire?** Not on their own. A GenXQR code works as long as the account's plan is active, unless you set an end date or a scan limit on it yourself. The Starter plan also has a monthly allowance of 5,000 scans; from Pro up, scans are unlimited.

**Is a dynamic code slower to open?** It adds one quick hop through the short link before the destination loads.

**Which one scans better?** For the same printed size, usually the dynamic code, because its short link makes fewer, bigger squares. A static code with short content, such as a phone number, scans just as well.

## Try both

Make a static code now on the [free generator](/generate), no account needed. To try dynamic codes, every new GenXQR account gets a [14-day free trial of the Pro plan](/pricing) with no card required. Make one code, print it, then change where it goes and scan it again.
