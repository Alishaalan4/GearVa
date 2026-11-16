# Gearva owner app API (`/mobile/v1`)

The contract between the API and the owner app (V3, Flutter). The API is built to this document in Phase 6; the app is built to it at the same time, against the examples below until each endpoint is live. **A change to an endpoint is a change to this file first**, listed in the changelog, and sent to the app developer.

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-15 | First version (Phase 6.0): auth, profile, cars, history, invoices, notifications, push devices, offers |

Status of each group: **Planned**, being built, or **Live** on the test server. All groups are **Planned** at version 1.0; the changelog says when each goes live.

---

## 1. Basics

| Topic | Rule |
|---|---|
| Base URL | Test server: `https://api.gearva.online` (free plan: the first request after 15 quiet minutes can take up to 2 minutes, see 1.4). Production: announced at launch |
| Format | JSON in and out, UTF-8. Request bodies need `Content-Type: application/json` |
| Auth | `Authorization: Bearer <accessToken>` on every endpoint except `/mobile/v1/auth/*` (section 2) |
| Language | Send `Accept-Language: ar` or `en`. Messages, service names and PDFs follow it; without it, the owner's saved language is used |
| Money | Integers in **cents** of US dollars (`totalCents: 4050` = $40.50). Never floats. The app formats them |
| Dates | Timestamps in ISO 8601 UTC (`2026-11-15T08:30:00.000Z`), shown in the phone's time zone. Calendar days (due dates, warranty) are `YYYY-MM-DD` and shown as is, with no time zone change |
| Distances | Always **km** in the API. Each car has `distanceUnit` (`KM` or `MI`); show miles as `round(km / 1.609344)` |
| IDs | UUID strings |
| Lists | Paginated: query `page` (from 1) and `pageSize` (default 20, max 50). Answer: `{ items, page, pageSize, total }` |
| Rate limits | 120 requests per minute per user and IP; login and password emails are stricter. Over the limit: HTTP 429 with code `RATE_LIMITED` |

### 1.1 Errors
Every error has the same body, whatever the HTTP status:

```json
{ "code": "INVALID_CREDENTIALS", "message": "Wrong email or password", "details": {} }
```

The app decides by `code`, never by `message` (the message is for logs and may change). Codes used by the owner app:

| HTTP | Code | When | What the app does |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | A field is missing or invalid; `details.issues` lists them | Show the field errors |
| 401 | `UNAUTHORIZED` | No token, or the access token expired | Refresh once (2.3), then retry; if refresh fails, go to login |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password | "Wrong email or password" |
| 401 | `INVALID_LINK` | Refresh token unknown, used or expired | Go to login |
| 403 | `FORBIDDEN` | Not allowed | Generic message |
| 404 | `NOT_FOUND` | Unknown id, or one that is not the owner's | "Not found"; go back |
| 409 | `INVOICE_PDF_NOT_READY` | The PDF is being made | Wait 3 s and retry, up to 5 times |
| 429 | `RATE_LIMITED` | Too many requests | "Please wait a moment" |
| 500 | `INTERNAL_ERROR` | Server problem | "Something went wrong, try again" |
| 502/503 | (no body) | The server is starting (test server) | Retry with a "starting up" message (1.4) |

### 1.2 Privacy rules the app must keep
- An owner only ever sees their **own** cars, visits, invoices and notifications. The server enforces this; the app never has a way to ask for anything else.
- No list export, no bulk PDF download.
- Tokens live only in secure storage (Keychain on iOS, Keystore through `flutter_secure_storage` on Android), never in logs, analytics or crash reports.

### 1.3 One person, several garages
An owner is one person, identified by phone number, who may be a customer of several garages that use Gearva. **One login shows everything from every garage**, and every car, visit, invoice, notification and offer says which garage it belongs to (`garage: { id, name }`). Each garage sees only its own data; the app is the only place where they come together.

### 1.4 The test server sleeps
The test server runs on a free plan. After 15 minutes without requests it sleeps, and the next request can take up to 2 minutes or get 502/503 while it wakes. The app should:
- use a request timeout of at least **120 seconds** for the first request after start;
- on 502, 503 or a timeout, show "Starting up, one moment…" and retry every 5 seconds for up to 2 minutes.

Production will not sleep, but keep this behaviour: it also covers short outages.

---

## 2. Login and account (`/mobile/v1/auth`)

### 2.1 How an owner gets an account
1. The garage adds the customer (phone, name) and their **email** in the garage app, then taps **Invite to the app**.
2. Gearva emails the owner a link to **set a password** on a web page (`https://gearva.online/en/owner/set-password?token=…`, or `/ar/…` for an Arabic-speaking owner), valid 7 days. Staff never see or type the password.
3. The page tells them to download the app; they log in with that email and password.
4. If a second garage invites the same person later, no new account is made: their cars from the new garage simply appear in the app (the garage sees "Uses the app").

Password rule: at least 10 characters (the same check runs in the app and on the server).

**Live on the test server (step 6.1, 2026-11-16):** the invite, its email and the set-password page. The page posts to `POST /mobile/v1/auth/set-password`; the app itself does not call it. The privacy policy for the store listings is at `https://gearva.online/privacy`.

### 2.2 `POST /mobile/v1/auth/login`
```json
// request
{ "email": "sara@example.com", "password": "correct horse battery" }
// 200
{
  "accessToken": "eyJhbGciOi…",
  "accessExpiresAt": "2026-11-15T08:45:00.000Z",
  "refreshToken": "rt_7f1c…",
  "refreshExpiresAt": "2026-12-15T08:30:00.000Z",
  "owner": { "id": "0193…", "name": "Sara Haddad", "email": "sara@example.com", "locale": "ar" }
}
```
Errors: `INVALID_CREDENTIALS` (also for an email that has no account, or an account whose password was never set: the answer never reveals which), `RATE_LIMITED` (10 tries per minute per IP).

The access token lasts **15 minutes**, the refresh token **30 days**.

### 2.3 `POST /mobile/v1/auth/refresh`
```json
// request
{ "refreshToken": "rt_7f1c…" }
// 200: the same shape as login, with a NEW refresh token
```
Each refresh token works **once**: always store the new one. Using an old one again is treated as theft and ends all of that phone's sessions (`INVALID_LINK`). If two requests get `401 UNAUTHORIZED` at the same time, refresh once and let both wait for it.

### 2.4 `POST /mobile/v1/auth/logout`
```json
{ "refreshToken": "rt_7f1c…" }
```
204. Ends the session. Before calling it, remove the push token (6.4).

### 2.5 `POST /mobile/v1/auth/forgot-password`
```json
{ "email": "sara@example.com" }
```
Always **202**, whether or not the email has an account (so nobody can test which emails are customers). If it has one, Gearva emails a reset link to the same set-password web page, valid 24 hours.

---

## 3. Profile (`/mobile/v1/me`)

### 3.1 `GET /mobile/v1/me`
```json
{
  "id": "0193…",
  "name": "Sara Haddad",
  "email": "sara@example.com",
  "phone": "+96170123456",
  "locale": "ar",
  "unreadNotifications": 3,
  "garages": [
    {
      "id": "0192…",
      "name": "Haddad Auto",
      "phone": "+9611234567",
      "locationText": "Beirut, Hamra",
      "hasLogo": true,
      "remindersOptOut": false,
      "marketingOptOut": false
    }
  ]
}
```
`garages` lists every garage where the owner is a customer.

### 3.2 `PATCH /mobile/v1/me`
```json
{ "locale": "en" }
```
200 with the profile. The language of emails, push messages and new invoices. (The name and phone are kept by the garages and cannot be changed in the app.)

### 3.3 `PATCH /mobile/v1/garages/{garageId}/preferences`
```json
{ "remindersOptOut": false, "marketingOptOut": true }
```
200 with that garage's entry from 3.1. Stops reminders or offers **from that garage only**.

### 3.4 `POST /mobile/v1/me/password`
```json
{ "currentPassword": "…", "newPassword": "…" }
```
204. Other sessions are ended; this one stays. Errors: `INVALID_CREDENTIALS` (current password wrong), `VALIDATION_FAILED`.

### 3.5 `DELETE /mobile/v1/me` (delete account)
```json
{ "password": "…" }
```
204. Required by Apple and Google. Deletes the **app account**: the login email, the password, every session and push token. The garages keep their own records of visits and invoices (they are the garages' business records), and can invite the person again later. The app then returns to the welcome screen.

### 3.6 `GET /mobile/v1/garages/{garageId}/logo`
The garage's logo as an image (`image/png`, `image/jpeg` or `image/webp`), 404 if it has none. Send the Bearer token; cache it.

---

## 4. Cars and history

### 4.1 `GET /mobile/v1/vehicles`
Every car of the owner, at every garage. Not paginated (a person has a few cars).
```json
[
  {
    "id": "0194…",
    "garage": { "id": "0192…", "name": "Haddad Auto" },
    "plate": "B 123456",
    "make": "Toyota",
    "model": "Corolla",
    "year": 2018,
    "distanceUnit": "KM",
    "lastRecordedKm": 84200,
    "lastRecordedAt": "2026-10-02T09:12:00.000Z",
    "estimatedKm": 85600,
    "nextService": {
      "serviceName": "Oil change",
      "dueKm": 89200,
      "dueDate": "2027-04-02",
      "status": "OK"
    }
  }
]
```
- `estimatedKm`: today's estimate from the car's average daily driving (it is a guess; show it as "about 85,600 km").
- `nextService`: the soonest upcoming service, or `null` when nothing is planned. `status` is `OK`, `SOON` (inside the garage's reminder window) or `OVERDUE`, computed by the server with the same rules as the reminders. Show `dueKm`, `dueDate` or both, whichever is set.

### 4.2 `GET /mobile/v1/vehicles/{vehicleId}`
The car from 4.1, plus every upcoming service:
```json
{
  "...": "every field of 4.1",
  "upcoming": [
    { "serviceName": "Oil change", "dueKm": 89200, "dueDate": "2027-04-02", "status": "OK" },
    { "serviceName": "Battery", "dueKm": null, "dueDate": "2027-10-02", "status": "OK" },
    { "serviceName": "Battery warranty ends", "dueKm": null, "dueDate": "2027-10-02", "status": "OK" }
  ]
}
```

### 4.3 `GET /mobile/v1/vehicles/{vehicleId}/visits?page=1`
The car's service history, newest first, paginated.
```json
{
  "items": [
    {
      "id": "0195…",
      "date": "2026-10-02T09:12:00.000Z",
      "odometerKm": 84200,
      "garage": { "id": "0192…", "name": "Haddad Auto" },
      "branchName": "Hamra",
      "services": [
        {
          "serviceName": "Oil change",
          "details": [
            { "label": "Oil", "value": "Castrol 5W-30, 4 L" },
            { "label": "Filter changed", "value": "Yes" }
          ],
          "notes": null,
          "warrantyUntil": null,
          "recommendation": "Brake pads at 30%, check in 3 months",
          "nextDueKm": 89200,
          "nextDueDate": "2027-04-02"
        }
      ],
      "invoice": { "id": "0196…", "number": "BR1-2026-0042", "totalCents": 4500, "status": "PAID" }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 7
}
```
- `details` are ready-made label/value pairs in the request's language, so the app needs no knowledge of each service type.
- `invoice` is `null` for a visit still in progress.

---

## 5. Invoices

### 5.1 `GET /mobile/v1/invoices?status=UNPAID&page=1`
Newest first. `status` filter is optional: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
```json
{
  "items": [
    {
      "id": "0196…",
      "number": "BR1-2026-0042",
      "issuedAt": "2026-10-02T10:01:00.000Z",
      "garage": { "id": "0192…", "name": "Haddad Auto" },
      "vehicle": { "id": "0194…", "plate": "B 123456", "make": "Toyota", "model": "Corolla" },
      "status": "PARTIALLY_PAID",
      "totalCents": 4500,
      "paidCents": 2000,
      "remainingCents": 2500
    }
  ],
  "page": 1, "pageSize": 20, "total": 12
}
```

### 5.2 `GET /mobile/v1/invoices/{invoiceId}`
```json
{
  "...": "every field of 5.1",
  "items": [
    { "description": "Oil change", "brand": "Castrol", "grade": "5W-30", "quantity": "1", "unitPriceCents": 3500, "totalCents": 3500 },
    { "description": "Oil filter", "brand": null, "grade": null, "quantity": "1", "unitPriceCents": 1000, "totalCents": 1000 }
  ],
  "subtotalCents": 4500,
  "discountCents": 0,
  "vatCents": 0,
  "payments": [ { "amountCents": 2000, "method": "CASH", "paidAt": "2026-10-02T10:02:00.000Z" } ],
  "nextServiceKm": 89200,
  "nextServiceDate": "2027-04-02",
  "warrantyText": null,
  "cancelReason": null
}
```
`quantity` is a decimal **string** ("1", "2.5") to keep it exact. A `CANCELLED` invoice has `cancelReason`; show it crossed out.

### 5.3 `GET /mobile/v1/invoices/{invoiceId}/pdf`
The invoice as `application/pdf`, in the invoice's language. Save it to a temporary file and open the system viewer or share sheet. `409 INVOICE_PDF_NOT_READY` means it is being made: retry after 3 seconds, up to 5 times.

---

## 6. Notifications and push

### 6.1 `GET /mobile/v1/notifications?page=1`
The in-app inbox, newest first.
```json
{
  "items": [
    {
      "id": "0197…",
      "type": "SERVICE_REMINDER",
      "title": "Oil change due soon",
      "body": "Kindly check your km, your next change is at 89,200 km. Haddad Auto",
      "garage": { "id": "0192…", "name": "Haddad Auto" },
      "ref": { "type": "vehicle", "id": "0194…" },
      "createdAt": "2026-11-15T07:00:00.000Z",
      "readAt": null
    }
  ],
  "page": 1, "pageSize": 20, "total": 9
}
```
- `type`: `SERVICE_REMINDER`, `WARRANTY_END`, `INVOICE`, `PAYMENT_REMINDER`, `CAR_READY`, `OFFER`, `MONTHLY_REMINDER`. Unknown future types must still show (title and body are always there).
- `ref` tells the app which screen to open: `vehicle`, `invoice` or `offer` with its id, or `null`.
- `title` and `body` are already in the owner's language.

### 6.2 `POST /mobile/v1/notifications/{id}/read` and `POST /mobile/v1/notifications/read-all`
204. The unread count is in `GET /mobile/v1/me` (`unreadNotifications`).

### 6.3 Push messages
Gearva sends push messages through **Firebase Cloud Messaging** (FCM) to Android and iOS (iOS through FCM's APNs connection). Each push is also an inbox row (6.1). The push has:
- a visible notification: `title`, `body`;
- `data`: `{ "notificationId": "0197…", "type": "SERVICE_REMINDER", "refType": "vehicle", "refId": "0194…" }`. Tapping opens the `ref` screen and marks it read.

### 6.4 `POST /mobile/v1/devices` and `DELETE /mobile/v1/devices/{token}`
```json
{ "token": "<FCM registration token>", "platform": "android" }
```
204. Register after login and whenever FCM gives a new token (`platform`: `android` or `ios`). Delete it before logout. A token that FCM reports as dead is removed by the server.

---

## 7. Offers

Offers are made by garages (garage side built in Phase 6 too). The app shows the active offers of the owner's garages, except garages the owner opted out of (`marketingOptOut`).

### 7.1 `GET /mobile/v1/offers`
```json
[
  {
    "id": "0198…",
    "garage": { "id": "0192…", "name": "Haddad Auto" },
    "title": "15% off brake service",
    "body": "Until the end of December, at both branches.",
    "hasImage": true,
    "discountType": "PERCENT",
    "discountValue": 15,
    "expiresAt": "2026-12-31T21:59:59.000Z"
  }
]
```
`discountType` `PERCENT` (`discountValue` is the percent) or `AMOUNT` (`discountValue` in cents). `expiresAt` may be `null`. The owner redeems an offer by visiting the garage; the garage applies it to the invoice.

### 7.2 `GET /mobile/v1/offers/{offerId}/image`
The offer image (Bearer token, cacheable), 404 if none.

### 7.3 `POST /mobile/v1/offers/{offerId}/viewed`
204. Call once when an offer is opened; it feeds the garage's offer report.

---

## 8. What is not in the app (on purpose)
- No booking or chat with the garage (later, if wanted).
- No payments in the app: owners pay at the garage (cash or Whish).
- Owners cannot add or edit cars or services; the garage records them.
- No sign-up: an account exists only after a garage invites the owner (2.1).
