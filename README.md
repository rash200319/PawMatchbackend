# PawMatch 🐾

**Smarter Adoptions, Happier Endings**

PawMatch is a pet adoption platform that matches animals with adopters based on lifestyle compatibility, not just listings. The **Pawsonality** engine scores pets against an adopter’s activity level, available time, living space, experience, existing pets, and neighborhood so returns go down and forever homes last.

This repository is the **Node.js / Express REST API**. It authenticates users, stores pets and applications in MySQL, scores matches, tracks post-adoption welfare, and integrates Cloudinary, SendGrid, and Twilio.

---

## Table of contents

- [Key features](#key-features)
- [User roles](#user-roles)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Demo accounts](#demo-accounts)
- [Authentication](#authentication)
- [Pawsonality matching](#pawsonality-matching)
- [API reference](#api-reference)
- [Welfare tracker](#welfare-tracker)
- [Achievements](#achievements)
- [Integrations](#integrations)
- [Health check](#health-check)

---

## Key features

- **Compatibility engine** — Weighted scoring (activity 25%, time 20%, space 20%, experience 15%, other pets 10%, neighborhood 10%) with hard safety filters (for example, high-energy pets are not matched to people with limited time).
- **Buddy-check** — Temperament matching against existing household pets (dogs/cats, dominance, nervousness).
- **Identity verification** — Sri Lankan NIC validation for adopters; shelter document upload (NGO Secretariat / DAPH / other) reviewed by admins.
- **Adoption workflow** — Apply → shelter review → approve. Pets stay `available` until the shelter approves.
- **Foster-to-adopt** — Pets can be flagged `is_foster`; `foster_assignments` records foster outcomes.
- **Shelter visits** — Adopters schedule meet-and-greets; shelters confirm or update status.
- **In-app messaging** — Adopters message shelters about a pet or adoption; shelters reply.
- **Welfare tracker** — Post-adoption logs for 90 days, using a 3 / 21 / 90-day phase model (decompression → learning & routine → bonding).
- **Community reports** — Crowdsourced reports of injured or abandoned animals (up to 5 images).
- **Achievements** — First adoption, 10-day welfare streak, 90-day bonding master.
- **Admin console APIs** — Platform stats, pending shelters, animal-report handling, welfare alerts, shelter analytics.

---

## User roles

| Role | Who it is | What they can do |
|------|-----------|------------------|
| **Adopter** | People looking for a pet | Register with NIC, take Pawsonality quiz, browse/match pets, apply, schedule visits, message shelters, log welfare |
| **Shelter** | Rescue / shelter partners | Register org, submit verification docs, list pets (once verified), review applications, manage visits and messages |
| **Admin** | Platform operators | Approve/reject shelters, view stats and alerts, handle animal reports and welfare flags |

Shelters cannot add pets until `verification_status` is `verified`.

---

## Technology stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MySQL (`mysql2` connection pool) |
| Auth | JWT (`jsonwebtoken`), passwords hashed with `bcryptjs` |
| Images / documents | Cloudinary + Multer (`multer-storage-cloudinary`) |
| Email | SendGrid (`@sendgrid/mail`); OTP also logged to console if unset |
| SMS | Twilio (mocked to console if credentials are missing) |
| Frontend (separate app) | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |

Default API port: **5000**. The frontend is expected at `CLIENT_URL` (default `http://localhost:5173`) for password-reset links.

---

## Architecture

```
Client (Next.js)
    │  JSON + JWT  (x-auth-token or Authorization: Bearer)
    ▼
Express  ── /api/* ──► controllers ──► MySQL
                 │              ├── matchingService (Pawsonality)
                 ├── middleware/auth + admin
                 └── Cloudinary / SendGrid / Twilio
```

- All JSON APIs live under `/api`.
- Protected routes use `middleware/auth.js`. Admin-only routes also use `middleware/admin.js`.
- The DB helper in `config/db.js` returns `{ rows }` so query code stays compatible with a PostgreSQL-style result shape.

---

## Project structure

Application code lives in `PawMatch-main/backend/`:

```
PawMatch-main/backend/
├── server.js                 # Express app, CORS, health check, error handlers
├── package.json
├── schema.sql                # Full schema + demo seed data
├── config/
│   ├── db.js                 # MySQL pool
│   └── cloudinary.js         # Pet images + verification documents
├── middleware/
│   ├── auth.js               # JWT
│   └── admin.js              # role === 'admin'
├── routes/api.js             # Route table
├── controllers/              # HTTP handlers
├── services/
│   ├── matchingService.js
│   ├── emailService.js
│   ├── alertService.js
│   └── achievementService.js
└── utils/
    ├── nicValidator.js       # Sri Lankan NIC (old 9+V/X and new 12-digit)
    └── logger.js             # activity_logs
```

---

## Prerequisites

- **Node.js** 18+ and npm
- **MySQL** 8+
- Accounts (optional for local dev; features degrade gracefully):
  - [Cloudinary](https://cloudinary.com/) — pet photos and shelter documents
  - [SendGrid](https://sendgrid.com/) — OTP and password-reset email
  - [Twilio](https://www.twilio.com/) — SMS welfare / test alerts

---

## Getting started

```bash
git clone https://github.com/rash200319/PawMatchbackend.git
cd PawMatchbackend/PawMatch-main/backend
npm install
```

Create a `.env` file in `PawMatch-main/backend/` (see [Environment variables](#environment-variables)).

Create tables and load demo data:

```bash
mysql -u root -p < schema.sql
```

Then start the server:

```bash
npm run dev    # nodemon
# or
npm start      # node server.js
```

The API listens on `http://localhost:5000`. A successful boot logs DB host, Cloudinary, and whether `JWT_SECRET` is set.

---

## Environment variables

Create `PawMatch-main/backend/.env`:

```env
# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-with-a-long-random-string

# MySQL
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=pawmatch

# Cloudinary (pet images + verification PDFs)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# SendGrid (OTP + password reset). If unset, codes are printed to the server console.
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@pawmatch.lk
SENDGRID_FROM_NAME=PawMatch

# Twilio (SMS). If unset, messages are logged as [MOCK SMS].
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

Never commit `.env`. The backend `.gitignore` already excludes it.

---

## Database

`schema.sql` creates the `pawmatch` database, all tables, and a small working dataset. Re-running it **drops existing tables** in that database, so use it on a disposable local DB only.

```bash
mysql -u root -p < schema.sql
```

| Table | Purpose |
|-------|---------|
| `users` | Credentials, role (`adopter` / `shelter` / `admin`), OTP and reset tokens |
| `pending_users` | Unverified signups until email OTP succeeds |
| `adopters` | Adopter profile + `pawsonality_results` JSON |
| `shelters` | Org name, registry, verification status, shelter code/slug |
| `admins` | Admin profile |
| `pets` | Listings, temperament JSON, social/living-match JSON, health flags, `is_foster` |
| `adoptions` | Applications (`pending` → `approved` / `active` / `completed`) |
| `foster_assignments` | Foster placements and outcomes |
| `pet_views` | Listing view counts for shelter analytics |
| `shelter_visits` | Meet-and-greet bookings |
| `shelter_messages` | Adopter ↔ shelter threads |
| `welfare_logs` | Daily check-ins (mood, notes, risk flag) |
| `animal_reports` | Community stray/injury reports |
| `activity_logs` | Audit trail |
| `user_achievements` | Unlocked badges |
| `demo_requests` | Product demo inquiries |

---

## Demo accounts

After running `schema.sql`, every seeded user has password **`password123`**:

| Role | Email |
|------|--------|
| Admin | `admin@pawmatch.com` |
| Shelter | `shelter@pawmatch.com` (Happy Tails Shelter, already verified) |
| Adopter | `adopter@pawmatch.com` (Jane Adopter, with a sample Pawsonality profile) |

Seeded pets include Buddy (Golden Retriever), Mittens (Tabby), and Rex (German Shepherd mix, foster). There is also a sample adoption, visit, welfare log, and community report.

---

## Authentication

1. **Register** `POST /api/register` with `name`, `email`, `password`, optional `phone`, `nic`, `role` (`adopter` or `shelter`), and `shelter_name` for shelters.
2. Adopter NICs are validated (`utils/nicValidator.js`): old format `#########V|X` or new 12-digit, including leap-year day-of-year checks.
3. A 6-digit OTP is emailed (or printed to the console) and stored on `pending_users` for **10 minutes**.
4. **Verify** `POST /api/verify` with `{ email, otp }` moves the user into `users` plus the matching role table.
5. **Login** `POST /api/login` returns a JWT.

Send the token on later requests:

```http
x-auth-token: <jwt>
```

or

```http
Authorization: Bearer <jwt>
```

Password reset: `POST /api/forgot-password` then `POST /api/reset-password`. Reset links use `CLIENT_URL`.

---

## Pawsonality matching

`POST /api/match` accepts quiz answers and scores every `available` pet.

Example body:

```json
{
  "userId": 3,
  "answers": {
    "1": "apartment",
    "2": "moderate",
    "3": "limited",
    "4": "couple",
    "5": "first",
    "6": "none",
    "7": "suburban",
    "101": "neutral",
    "102": "very_friendly"
  }
}
```

| Key | Meaning | Typical values |
|-----|---------|----------------|
| `1` | Living space | `apartment`, `house_small`, `house_large`, `rural` |
| `2` | Activity | `sedentary`, `moderate`, `active`, `athletic` |
| `3` | Time available | `limited`, `moderate`, `flexible`, `full` |
| `5` | Experience | `first`, `some`, `experienced`, `expert` |
| `6` | Existing pets | `none`, `dog`, `cat` |
| `7` | Neighborhood | `urban`, `suburban`, `semi_rural`, `rural` |
| `101` | Current pet dominance | `submissive`, `neutral`, `dominant` |
| `102` | Current pet sociability | `very_friendly`, `selective`, `nervous` |

Disqualification examples: limited time + high/athletic energy; large dog + apartment when living-match is false; existing dog when the pet’s `social_profile.dogs` is false.

Response pets include `matchScore` (0–100), up to three `matchReasons`, and `profile_image_url`. If `userId` is sent, answers are stored on the user for later matching.

---

## API reference

Base URL: `http://localhost:5000/api`

`🔒` = JWT required. `👑` = admin role.

### Auth and account

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | | Start signup; sends OTP |
| POST | `/login` | | Returns JWT |
| POST | `/verify` | | Confirm email OTP |
| POST | `/resend-otp` | | New OTP |
| POST | `/validate-nic` | | Check NIC without registering |
| POST | `/forgot-password` | | Email reset link |
| POST | `/reset-password` | | Set new password |
| GET | `/me` | 🔒 | Current user |
| PUT | `/profile` | 🔒 | Update profile |
| PUT | `/update-password` | 🔒 | Change password |
| PUT | `/notifications` | 🔒 | Email / SMS preferences |
| PUT | `/notifications/read` | 🔒 | Mark notifications read |
| DELETE | `/account` | 🔒 | Delete account |
| GET | `/logs` | 🔒 | Activity log |
| GET | `/achievements` | 🔒 | Unlocked badges |

### Matching and pets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/match` | | Rank available pets |
| GET | `/pets` | | List pets |
| GET | `/pets/:id` | | Pet detail |
| POST | `/pets` | 🔒 | Add pet (multipart `image`; shelter must be verified) |
| PUT | `/pets/:id` | 🔒 | Update pet (optional new image) |

Pet create fields include `name`, `type`, `breed`, `age`, `gender`, `size`, `energy_level`, `temperament`, `social_profile`, `living_situation_match`, `description`, health flags (`is_vaccinated`, `is_neutered`, `is_microchipped`, `is_health_checked`), `weight`, and `is_foster`. Images: JPG/PNG/WebP, max 5 MB, stored under Cloudinary folder `pawmatch/pets`.

### Adoptions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/adopt` | 🔒 | Apply (`{ petId }`). Status starts as `pending`. |
| GET | `/adoptions/me` | 🔒 | Adopter’s applications |
| GET | `/shelter/applications` | 🔒 | Applications for this shelter’s pets |
| POST | `/shelter/approve-adoption` | 🔒 | Shelter approval |

### Welfare

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/welfare/:adoptionId` | 🔒 | 90-day dashboard (owner + active adoption) |
| POST | `/welfare/:adoptionId/log` | 🔒 | Submit a log |
| GET | `/welfare/shelter/alerts` | 🔒 | Flagged logs for the shelter |
| POST | `/welfare/respond` | 🔒 | Shelter response to an alert |

### Visits and messaging

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/visits` | 🔒 | Schedule a visit |
| GET | `/visits` | 🔒 | Adopter’s visits |
| PUT | `/visits/:id` | 🔒 | Update visit |
| DELETE | `/visits/:id` | 🔒 | Cancel visit |
| GET | `/shelter/:shelterId/visits` | | Shelter visit queue |
| PUT | `/shelter/visits/:visitId` | | Update visit status |
| POST | `/shelter/message` | 🔒 | Message a shelter |
| GET | `/user/messages` | 🔒 | Adopter inbox |
| GET | `/shelter/messages` | 🔒 | Shelter inbox |
| POST | `/shelter/message/respond` | 🔒 | Shelter reply |
| GET | `/shelter/pets` | 🔒 | Shelter’s pets |
| GET | `/shelter/potential-matches` | 🔒 | Adopters who match this shelter’s pets |
| GET | `/shelter/public/:id` | | Public shelter profile |

### Reports, demos, alerts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/reports` | | Submit report (`images` multipart, max 5) |
| GET | `/reports` | | Latest 10 reports |
| DELETE | `/reports/:id` | | Cancel a still-`pending` report |
| POST | `/demo/request` | | Request a product demo |
| GET | `/demo/requests` | | List demo requests |
| POST | `/alerts/test` | | Send a test SMS (`phone`, `message`) |

### Admin and shelter verification

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/shelters/verify-request` | | Upload registry document (`document` file, max 10 MB) |
| GET | `/admin/pending-shelters` | 👑 | Shelters awaiting review |
| POST | `/admin/verify-shelter` | 👑 | `{ shelterId, action: "approve" \| "reject", reason }` |
| GET | `/admin/stats` | 👑 | Platform stats |
| GET | `/admin/all-shelters` | 👑 | All shelters |
| GET | `/admin/alerts` | 👑 | Combined alerts |
| POST | `/admin/handle-report` | 👑 | Process an animal report |
| POST | `/admin/handle-welfare` | 👑 | Process a welfare alert |
| GET | `/admin/all-adoptions` | 👑 | All adoptions |
| GET | `/admin/analytics/shelter/:id` | 👑 | Per-shelter analytics |

Unknown paths return `404` with `{ error, path }`. Unhandled errors return `500` with `details`; stack traces only when `NODE_ENV=development`.

---

## Welfare tracker

After an adoption is **active**, the adopter logs mood and notes. The dashboard uses a 90-day window inspired by the 3-3-3 rule:

| Phase | Days | Name |
|-------|------|------|
| 1 | 1–3 | Decompression |
| 2 | 4–21 | Learning & Routine |
| 3 | 22–90 | Bonding & Confidence |

The API returns current day, overall progress, a 7-day streak count, recent logs, and phase progress. Logs can be risk-flagged for shelter/admin follow-up.

---

## Achievements

| Type | When it unlocks |
|------|-----------------|
| `first_adoption` | First approved / active / completed adoption |
| `10_day_streak` | Ten-day welfare logging streak |
| `bonding_master` | Completing the 90-day welfare journey |

Awards are unique per user (`user_id` + `achievement_type`).

---

## Integrations

| Service | Used for | If missing |
|---------|----------|------------|
| **Cloudinary** | Pet photos (`pawmatch/pets`), verification docs (`pawmatch/documents`) | Uploads fail |
| **SendGrid** | Signup OTP, password reset, admin mail | OTP / reset URL printed to stdout |
| **Twilio** | SMS alerts (`alertService`) | Logged as `[MOCK SMS]` |

---

## Health check

```bash
curl http://localhost:5000/
```

Response: `PawMatch Backend is running`

---

PawMatch — matching pets and people who will actually thrive together.
