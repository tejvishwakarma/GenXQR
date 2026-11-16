---
title: UPI QR codes for your shop: which kind to print, and where
description: A UPI QR code at the counter and a UPI QR code on a poster need different things. Here is the difference between a direct UPI code and a payment page, and when to use each.
category: Payments
date: 2026-11-10
---

Almost every customer in India can pay by UPI, so a UPI QR code is often the first QR code a business prints. But there are two quite different kinds, and choosing the wrong one for the spot can cost you payments.

## What is inside a UPI QR code

A UPI QR code holds a UPI payment link, the format set by NPCI. It looks like this:

`upi://pay?pa=yourshop@okhdfcbank&pn=Blue%20Cafe&am=250.00&cu=INR&tn=Order%20123`

Each part fills in one field in the customer's app:

| Part | Means | Example |
| --- | --- | --- |
| `pa` | Payee address: your UPI ID | yourshop@okhdfcbank |
| `pn` | Payee name | Blue Cafe |
| `am` | Amount, optional | 250.00 |
| `cu` | Currency, always INR | INR |
| `tn` | Note, optional | Order 123 |

When the amount is left out, the customer types it. When it is included, the app fills it in. Either way the customer still checks the details and enters their UPI PIN in their own app; a QR code can never take money on its own.

## Kind 1: a direct UPI code

A direct UPI code holds that payment link itself. When a customer scans it **inside Google Pay, PhonePe, Paytm, BHIM or their bank's app**, the app fills in your details and they just enter the amount and their PIN.

- **Best for:** the shop counter, the delivery bag, anywhere a customer is about to pay and already has a UPI app open.
- **Free, with no account:** make one on GenXQR's [free UPI QR code generator](/generate/upi) and download it as an image. You enter your UPI ID, the name to show, and optionally an amount and a note.
- **Limits:** it can never be changed (a new UPI ID means a new code), and you can't see how many people scanned it.

If your bank or payment app has already given you a merchant QR for the counter, that does the same job. Keep using it there.

## Kind 2: a UPI payment page

The second kind is a dynamic QR code that opens a small payment page with your business name, the amount (if you set one) and a **Pay** button. Tapping Pay opens the customer's UPI app with everything filled in. There is also a button to copy your UPI ID.

On Android, the Pay button offers every UPI app installed on the phone. On iPhones, which don't offer a "choose an app" menu for UPI links, the page shows a separate button for Google Pay, PhonePe and Paytm, plus one for any other UPI app, so the payment opens in the app the customer actually uses. (Safari can't tell which apps are installed, so a button for an app the customer doesn't have simply does nothing; the copy button is the fallback.)

- **Best for:** posters, flyers, invoices, emails, event standees and packaging, where people scan with their **phone camera**, not from inside a UPI app.
- **You can change it.** New UPI ID, new amount or a new note: edit it in your dashboard and the printed code keeps working.
- **You see the scans:** how many, when, and from which cities, like any other dynamic code.

The money never passes through GenXQR. The page only opens the customer's UPI app, and the payment goes straight to your UPI ID. GenXQR doesn't charge anything per payment, and it doesn't see whether a payment was made, only that the code was scanned.

On the payment page, a fixed amount can be anything from ₹0.01 to ₹5,00,000 with up to two decimals, and the note can be up to 50 characters.

## The one thing to know

**UPI apps' built-in scanners only read direct UPI codes.** If a customer opens PhonePe and points it at a payment-page code, the app won't recognise it as a payment. That is why the counter, where people scan from their UPI app, should have a direct code, and printed marketing, where people use the camera, can use a payment page.

| | Direct UPI code | UPI payment page |
| --- | --- | --- |
| Scan from inside a UPI app | Yes | No |
| Scan with the phone camera | Depends on the phone | Yes, opens the page |
| Change UPI ID or amount later | No | Yes |
| Scan counts | No | Yes |
| Cost | Free | Paid plan (14-day free trial) |

## Where to use which

| Spot | Use | Amount |
| --- | --- | --- |
| Shop or cafe counter | Direct code | Leave empty |
| Delivery bag or parcel | Direct code | Leave empty |
| Event entry or workshop fee | Payment page | Fixed |
| Membership or monthly fee poster | Payment page | Fixed, edit when it changes |
| Invoice or quotation PDF | Payment page | Leave empty, or the invoice total |
| Donation box or appeal poster | Payment page | Leave empty |
| Product on a stall with one price | Direct code or payment page | Fixed |

If you use both at one place, label them clearly: "Pay here with any UPI app" next to the counter code, and "Scan with your camera to pay" next to a payment-page code on a poster.

## Keep payments safe: for you and your customers

NPCI's [UPI Safety Shield](https://npci.org.in/what-we-do/upi/upi-safety-shield) sets out two rules that every shop should know, because your customers will be asking:

- **The UPI PIN is only for sending money.** Nobody ever needs to enter a PIN to receive money.
- **A QR code is only for paying.** Scanning a code never puts money into your account. Anyone who asks a customer, or you, to "scan to receive a refund" is running a scam.

And three habits that protect the shop:

1. **Check that the money arrived, in your own app.** Look at your UPI app, bank SMS or payment speaker, not the customer's screen. A screenshot of a "successful" payment can be faked.
2. **Look at your counter code now and then.** A known trick is to stick a different QR code over a shop's real one, so payments go to someone else. If your code is a sticker, check it hasn't been covered or replaced.
3. **Make sure the right name shows.** When a customer scans, their UPI app shows the name of the account receiving the money. Make one test payment to see what that name is, and put the same name next to your code so customers can check before they enter their PIN.

## Before you print

1. **Make a small test payment** of ₹1 to yourself from a different phone, and check the name that appears is your business's.
2. **Use a fixed amount only for one price.** For a shop counter, leave the amount empty so customers type it.
3. **Keep the code dark on a light background** and large enough to scan from where customers stand. Our [print checklist](/blog/qr-codes-that-scan-print-checklist) covers size and contrast.
4. **Put your business name next to the code,** so customers can check they are paying the right person before they enter their PIN.
5. **Test the payment page on both an Android phone and an iPhone,** if you use one, so you have seen what each customer sees.

## Frequently asked questions

**Does GenXQR take a cut of payments?** No. Payments go from the customer's UPI app to your UPI ID. GenXQR is not part of the payment.

**Can I see who paid?** Not in GenXQR. Your UPI app or bank statement shows payments; GenXQR's analytics show how often a payment-page code was scanned.

**Can a direct UPI code show a fixed amount?** Yes. Enter it when you make the code. It can't be changed afterwards, so use it only for a price that won't change.

**I have more than one shop. One code or several?** For the counter, each shop uses its own direct code (or the merchant QR from its bank). For payment pages on posters, give each shop its own code and add it as a [place](/features), so you can compare scans per shop.

**Do customers need to install anything?** No. A direct code is read by the UPI app they already have, and a payment page opens in their phone's browser.

Make a [free direct UPI code](/generate/upi) for your counter now, or [try a UPI payment page](/signup) free for 14 days. For restaurants, see also our guide to [QR code menus](/blog/qr-code-menu-for-restaurants).
