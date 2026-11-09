---
title: QR codes that scan: a print checklist for size, contrast and colour
description: Most QR codes that fail are too small, too pale or too crowded. A practical checklist for printing codes that scan first time, with what we learned testing our own designs.
category: Design
---

A QR code that doesn't scan is worse than no code at all: the customer tries once, gives up, and remembers the frustration. The good news is that almost every failure comes from a handful of mistakes you can check before printing.

## 1. Make it big enough for the distance

The usual rule of thumb is that **a QR code should be at least one-tenth as wide as the distance it is scanned from.** Someone scanning from 30 cm (a table card or flyer in hand) needs a code about 3 cm wide. Someone scanning a poster from 2 metres away needs about 20 cm.

Never go below about 2 cm, even on a visiting card or a product label.

Dynamic codes help here. They hold a short link instead of a long web address, so the pattern has fewer, larger squares, and those scan from further away at the same printed size.

## 2. Dark code, light background, strong contrast

Phones look for dark squares on a light background. **Keep the code dark and the background light, and keep the difference big.**

We learned how much this matters testing GenXQR's own frame designs with a standard QR decoder. Codes in a mid-tone violet (about 5.6:1 contrast against white) failed to read at some sizes on four of our six premium frames. Codes with a contrast of 8.5:1 or more read on every frame we tested. That is why GenXQR's designer now warns you when the code's colour is too light for the frame you picked, and offers a darker shade of it.

So:

- **Black or a very dark brand colour** for the code
- **White or a very pale colour** for the background
- **Avoid light-on-dark ("inverted") codes.** Some phone cameras can't read them.
- **Avoid gradients that fade to a pale colour** in part of the code

## 3. Leave a quiet zone

A QR code needs an empty margin around it, called the quiet zone, so the phone can tell where the code ends. The QR standard asks for a margin **four squares wide** on every side. Don't let text, borders or photos run up to the edge of the code.

## 4. Keep the logo modest

A logo in the middle works because QR codes have built-in error correction: they still read when part of the pattern is covered. Codes made in the GenXQR dashboard use the highest error-correction level, which can recover from roughly 30% damage. But that recovery is also what copes with smudges, scratches and glare, so don't use it all on a big logo. **Keep the logo small, and never cover the three large squares in the corners.**

## 5. Watch the surface and the light

- **Matte beats glossy.** Lamination and shiny paper reflect lights straight back at the camera.
- **Flat beats curved.** On a bottle or cup, keep the code small relative to the curve, or put it on a flat label.
- **Avoid busy patterned backgrounds** behind the code. Put it on a plain panel.

## 6. Say what happens when people scan

A code on its own gets fewer scans than one with a reason. Add a short call to action, such as "Scan for the menu", "Scan to pay" or "Scan for 10% off", in a frame around the code or next to it.

## 7. Test the real print, on real phones

Before printing hundreds, print one at the real size on the real material and scan it:

- with an **iPhone** camera and an **Android** camera (and Google Lens)
- from the **distance** people will actually stand at
- in the **light** where it will hang, including at night if it is outdoors

## 8. Use a code you can fix

Even a perfect print can't fix a wrong link. If the code goes on anything expensive to reprint, use a [dynamic QR code](/blog/dynamic-vs-static-qr-codes) so you can change where it goes after printing.

## The short version

Big enough for the distance, dark on light, a clear margin, a small logo, matte paper, a call to action, and one test print scanned on two phones. Design yours in the [free generator](/generate), or in the GenXQR dashboard with frames, logos and a contrast check built in.
