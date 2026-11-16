---
title: QR codes that scan: a print checklist for size, contrast and colour
description: Most QR codes that fail are too small, too pale or too crowded. A practical checklist for printing codes that scan first time, with what we learned testing our own designs.
category: Design
date: 2026-11-10
---

A QR code that doesn't scan is worse than no code at all: the customer tries once, gives up, and remembers the frustration. The good news is that almost every failure comes from a handful of mistakes you can check before printing.

## 1. Make it big enough for the distance

The usual rule of thumb is that **a QR code should be at least one-tenth as wide as the distance it is scanned from.** Someone scanning from 30 cm (a table card or flyer in hand) needs a code about 3 cm wide. Someone scanning a poster from 2 metres away needs about 20 cm.

| Where it is scanned from | Typical use | Code at least |
| --- | --- | --- |
| 20–30 cm | Visiting card, label, flyer in hand | 2–3 cm |
| 50 cm | Table tent, counter standee | 5 cm |
| 1 metre | Shelf talker, wall poster at arm's length | 10 cm |
| 2 metres | Poster across a room, shop window | 20 cm |
| 5 metres | Banner, hoarding at a shopfront | 50 cm |

Never go below about 2 cm, even on a visiting card or a product label.

Dynamic codes help here. They hold a short link instead of a long web address, so the pattern has fewer, larger squares, and those scan from further away at the same printed size. If a static code to a long link has to go somewhere small, that is a strong reason to make it [dynamic instead](/blog/dynamic-vs-static-qr-codes).

## 2. Dark code, light background, strong contrast

Phones look for dark squares on a light background. **Keep the code dark and the background light, and keep the difference big.**

We learned how much this matters testing GenXQR's own frame designs with a standard QR decoder. Codes in a mid-tone violet (about 5.6:1 contrast against white) failed to read at some sizes on four of our six premium frames. Codes with a contrast of 8.5:1 or more read on every frame we tested. That is why GenXQR's designer now warns you when the code's colour has less than 7:1 contrast with the frame you picked, and offers a darker shade of it.

So:

- **Black or a very dark brand colour** for the code
- **White or a very pale colour** for the background
- **Avoid light-on-dark ("inverted") codes.** Some phone cameras can't read them.
- **Avoid gradients that fade to a pale colour** in part of the code
- **Check brand colours twice.** A yellow, light blue or pink that looks strong in a logo is usually too pale for a QR code.

## 3. Leave a quiet zone

A QR code needs an empty margin around it, called the quiet zone, so the phone can tell where the code ends. The QR standard asks for a margin **four squares wide** on every side. Don't let text, borders or photos run up to the edge of the code.

Designers often trim this margin to make the code "fit" a layout. If space is tight, make the code a little smaller and keep the margin, rather than the other way round.

## 4. Keep the logo modest

A logo in the middle works because QR codes have built-in error correction: they still read when part of the pattern is covered. There are four levels:

| Level | Can recover from roughly |
| --- | --- |
| L | 7% damage |
| M | 15% |
| Q | 25% |
| H | 30% |

Codes made in the GenXQR dashboard use level H, the highest. Codes from the [free generator](/generate) use level M and have no logo. But that recovery is also what copes with smudges, scratches and glare, so don't use it all on a big logo. **Keep the logo small, and never cover the three large squares in the corners.**

## 5. Download the right file for the job

A QR code that is sharp on screen can print blurred if the file is too small for the print size. Printers usually want around 300 dots per inch, so a picture 600 pixels wide prints sharply up to about 5 cm.

- **The free generator** gives a 600-pixel PNG: fine for visiting cards, labels and small flyers.
- **In the GenXQR dashboard** you can download PNG, JPG, WEBP, **SVG**, PDF and EPS. **SVG** is drawn with shapes, not pixels, so it stays sharp at any size, from a sticker to a hoarding. Use it for anything big.
- **Framed codes as PDF** are a high-resolution image (A6 width at about 600 dpi): sharp for cards and table tents. For a framed code on a poster, use SVG.
- **EPS** is there for printers who ask for it. It is the plain code in your colours, without the frame, logo or dot style.

When you place the file in your design, **scale it evenly** (hold Shift while resizing) and never stretch it into a rectangle.

## 6. Check the colours in print

Screens and printers show colour differently. A dark violet on your monitor can come out lighter on paper, which lowers the contrast you checked on screen. Before printing hundreds, print one proof on the real paper and look at the code in daylight. If it has turned out paler than you expected, choose a darker shade.

## 7. Watch the surface and the light

- **Matte beats glossy.** Lamination and shiny paper reflect lights straight back at the camera.
- **Flat beats curved.** On a bottle or cup, keep the code small relative to the curve, or put it on a flat label.
- **Avoid busy patterned backgrounds** behind the code. Put it on a plain panel.
- **Outdoors, plan for sun and rain.** Sunlight fades printed colour over months, and a faded code loses contrast. Use outdoor inks or a matte UV laminate, and check outdoor codes now and then.
- **On screens and TVs,** keep the brightness up and the code on screen long enough to scan: a code that appears for two seconds in a video advert is gone before most people get their phone out.

## 8. Put it where people can scan comfortably

- **Around chest to eye height** on walls and standees. A code near the floor or above a doorway gets fewer scans.
- **Somewhere people can stand still,** not across a busy walkway or on the side of a moving vehicle at a size only readable when parked.
- **Where there is mobile signal.** A dynamic code and any page behind it need internet. In a basement restaurant with no signal, put a [Wi-Fi QR code](/generate/wifi) next to the menu code so guests can get online first.

## 9. Say what happens when people scan

A code on its own gets fewer scans than one with a reason. Add a short call to action, such as "Scan for the menu", "Scan to pay" or "Scan for 10% off", in a frame around the code or next to it. Tell people what they will get, not just "Scan me".

## 10. Test the real print, on real phones

Before printing hundreds, print one at the real size on the real material and scan it:

- with an **iPhone** camera and an **Android** camera (and Google Lens)
- with an **older or cheaper phone** if you can borrow one: their cameras are less forgiving
- from the **distance** people will actually stand at
- in the **light** where it will hang, including at night if it is outdoors

Then check it opens the right thing: the right page, the right UPI ID, the right Wi-Fi network.

## 11. Use a code you can fix

Even a perfect print can't fix a wrong link. If the code goes on anything expensive to reprint, use a [dynamic QR code](/blog/dynamic-vs-static-qr-codes) so you can change where it goes after printing.

## The short version

| Check | Pass if |
| --- | --- |
| Size | At least one-tenth of the scanning distance, never under 2 cm |
| Contrast | Dark code on a light background; at least 7:1, ideally 8.5:1 |
| Quiet zone | Four squares of empty margin on every side |
| Logo | Small, and off the three corner squares |
| File | SVG for anything large; PNG only at small sizes |
| Proof | One test print on the real paper, scanned on two phones |
| Surface | Matte, flat, plain background |
| Call to action | Says what the scan gives |

Design yours in the [free generator](/generate), or in the GenXQR dashboard with frames, logos and a contrast check built in. For specific uses, see our guides to [restaurant QR menus](/blog/qr-code-menu-for-restaurants), [UPI payment codes](/blog/upi-qr-code-for-your-shop) and [Google review codes](/blog/google-review-qr-code).
