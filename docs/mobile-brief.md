# Gearva owner app: brief for the Flutter developer

| Version | Date | What changed |
|---|---|---|
| 1.0 | 2026-11-15 | First version, with API contract 1.0 |

This brief and the API contract (`mobile-api.md`, the second part of this PDF) are everything needed to build the Gearva owner app. Updates come as new versions of this PDF; the tables at the top of both parts say what changed.

---

## 1. Gearva in one minute

Gearva is a system for car garages in Lebanon. It has three parts:

| Part | Who uses it | Status |
|---|---|---|
| **Garage app** (web) | Garage owners and staff: customers, cars, services, invoices, payments, reminders | Built, live on the test server |
| **Admin app** (web) | The Gearva team: garage accounts, subscriptions | Built, live on the test server |
| **Owner app** (mobile) | **Car owners**, the garages' customers | **Your part** |

When a garage services a car, it records what was done (oil change, brand, grade, km). Gearva then works out when the next service is due and reminds the owner. **The owner app lets car owners see their cars, the full service history, when the next service is due, their invoices, reminders and the garages' offers**, from every garage that uses Gearva.

The server (API) is built by the Gearva team, in parallel with the app (section 6).

---

## 2. The app at a glance

- **Flutter**, one code base for **Android and iOS**.
- **Arabic and English**, with the full right-to-left layout in Arabic. The app opens in the phone's language when it is Arabic or English, else in English; the owner can switch in the profile.
- **Light and dark mode**, following the phone.
- **Read-only for owners:** they look at their data; the garage records everything.
- **No sign-up screen:** a garage invites the owner by email, and the owner sets a password on a web page (mobile-api 2.1). The app has **log in** and **forgot password** only.

---

## 3. Screens

The design prototype (`gearva-demo.html`, sent with this PDF) shows the owner app in **steps 11 to 13** ("Log in", "See history and offers", "Return to the garage"). Use it for the look and feel; the list below is the full set of screens. The API sections are in the second part.

| # | Screen | Shows | API |
|---|---|---|---|
| 1 | **Welcome / Log in** | Gearva logo, email, password, "Forgot password?". A short line: "Your garage gives you access to the app." | 2.2 |
| 2 | **Forgot password** | Email field; then "If this email has an account, we sent a link." | 2.5 |
| 3 | **Starting up** | Shown while the server wakes (502/503/timeout): "Starting up, one moment…" with retries | 1.4 |
| 4 | **Home: my cars** | One card per car: plate, make and model, the garage's name, about how many km now, and the **next service** with a coloured status (OK / soon / overdue). Unread notifications badge | 4.1, 3.1 |
| 5 | **Car** | The car's details, the list of **upcoming services** (km and/or date, status), and its **service history** (newest first, loads more on scroll) | 4.2, 4.3 |
| 6 | **Visit** | Date, km, garage and branch, each service with its details (brand, grade, …), the garage's recommendation, next due, and a link to the invoice | 4.3 |
| 7 | **Invoices** | List with filter (all / unpaid / paid): number, date, garage, car, total, paid state | 5.1 |
| 8 | **Invoice** | Lines, totals, discount, VAT, payments, remaining amount, next service; **Download PDF** (opens the system viewer or share sheet) | 5.2, 5.3 |
| 9 | **Notifications** | The inbox: title, text, garage, time; unread ones highlighted; tap opens the linked car, invoice or offer; "Mark all as read" | 6.1, 6.2 |
| 10 | **Offers** | Active offers from the owner's garages: image, title, text, discount, until when, garage. Tapping opens the offer | 7.1, 7.2, 7.3 |
| 11 | **Garages** | The owner's garages: name, logo, phone (tap to call), location; per garage, switches for "Reminders" and "Offers" | 3.1, 3.3, 3.6 |
| 12 | **Profile** | Name, email, phone (read only); language; change password; log out; **delete account** (with password and a clear warning) | 3.2, 3.4, 3.5, 2.4 |

Navigation suggestion: a bottom bar with **Cars**, **Invoices**, **Offers**, **Notifications** and **Profile**; Garages is reached from Profile.

**Empty states matter:** a new owner may have one car with no history yet, no invoices, no offers. Every list needs a friendly empty message.

---

## 4. Design

Match the garage app's look (the prototype file). The colours, as in the web apps:

| Token | Light | Dark | Use |
|---|---|---|---|
| Page background | `#f4f2ee` | `#0b1211` | Screen background |
| Card | `#ffffff` | `#15201e` | Cards, sheets |
| Ink | `#101a19` | `#f2f4f3` | Main text |
| Muted | `#55605e` | `#a9b4b1` | Secondary text |
| Line | `#ddd8d0` | `#2a3735` | Borders, dividers |
| **Brand orange** | `#ff600f` | `#ff600f` | Main buttons, active tab, brand marks (text on it: `#101a19`) |
| Brand text | `#bf4300` | `#ff8a4d` | Orange text and links |
| Tint | `#ffede1` | `#3a2417` | Light orange backgrounds ("soon") |
| OK background / text | `#ddf3e4` / `#14612f` | `#173826` / `#8be0ab` | "OK", "Paid" |
| Bad background / text | `#fde3dd` / `#8a1f0e` | `#47211b` / `#ffb4a6` | "Overdue", "Unpaid", errors |
| Neutral background / text | `#eceae5` / `#3a4442` | `#24302e` / `#c9d1cf` | Neutral chips ("Cancelled") |

- **Fonts:** **Plus Jakarta Sans** for Latin text, **IBM Plex Sans Arabic** for Arabic (both free on Google Fonts; bundle them in the app).
- **Status colours:** next service `OK` = OK colours, `SOON` = tint with brand text, `OVERDUE` = bad colours. Invoices `PAID` = OK, `UNPAID` = bad, `PARTIALLY_PAID` = tint, `CANCELLED` = neutral.
- Rounded cards (about 10–14 px radius), generous spacing, touch targets at least 44 px.
- The app icon and store images come from the Gearva logo (sent with this PDF).

---

## 5. Technical requirements

1. **Flutter stable**, null safety, Android 8+ and iOS 15+.
2. **All text in localisation files** (`ar` and `en`, e.g. ARB with `flutter_localizations`); no text in the code. Use direction-aware layout (`EdgeInsetsDirectional`, `AlignmentDirectional`) so Arabic mirrors correctly.
3. **Tokens in secure storage** (`flutter_secure_storage`), never in plain preferences, logs or crash reports. Refresh as described in mobile-api 2.3, one refresh at a time.
4. **Money:** amounts arrive in cents; show them as dollars with the `intl` package for the current language (`$45`, `$40.50`). Never do money maths with doubles.
5. **Distances:** show each car in its own unit (mobile-api section 1).
6. **Push:** Firebase Cloud Messaging (`firebase_messaging`), with the notification permission asked at a sensible moment (after login, explaining why), and token registration as in mobile-api 6.4.
7. **Network:** one HTTP client with the Bearer token, `Accept-Language`, the 401 refresh, the "starting up" retries (mobile-api 1.4), and decoding of the error body by `code`.
8. **Offline:** show the last loaded data if there is no connection, with a small "offline" note. Nothing is edited offline.
9. **Accessibility:** system font size supported, screen reader labels on icons.
10. **Analytics or crash reporting:** only if it collects no personal data (no names, plates, emails or tokens).

---

## 6. How we work together

### Order of work
The API is built in steps. Until an endpoint is live, build against the JSON examples in the API contract (a mock client is ideal: it can stay for tests).

| Step | Server side (Gearva team) | App side (you) |
|---|---|---|
| Now | API contract 1.0 (this PDF) | Project setup, theme, localisation, navigation, all screens with example data |
| 6.1–6.2 | Owner accounts, invite emails, the set-password page, **login API live** | Real login, refresh, logout, forgot password, profile |
| 6.3 | **Cars, history and invoices live** (PDF included) | Connect screens 4–8 |
| 6.4 | **Notifications and push live** | Inbox, FCM, device tokens |
| 6.5 | **Offers live** (garages can create them) | Offers screens |
| Release | Production server | Store builds and release |

You receive a message (and a new PDF version) each time a step goes live, with **test accounts** on the test server: a test garage with cars, visits and invoices, and an owner login.

### Repository and accounts
- The code lives in its own Git repository, **`gearva-mobile`**, owned by the client (Gearva). You get write access.
- **Firebase project, Apple Developer account and Google Play Console account** are created in the client's name; you get access to them. Do not create them under your own account.
- Builds for testing go through **TestFlight** (iOS) and **Google Play internal testing** (Android).

### What we need from you at each step
- A short note of what is done, and anything in the contract that is unclear or missing (better to ask than to guess: a contract change is cheap before both sides build it).
- Builds to try on real phones.

### Store requirements we already handle
- **Privacy policy page:** `https://gearva.online/privacy` (comes with step 6.1).
- **Account deletion** inside the app (mobile-api 3.5), which Apple and Google require.
- **No sign-up:** for the store review we provide a demo owner login on the test server.
