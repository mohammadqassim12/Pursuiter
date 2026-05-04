# Pursuiter

> A two-sided AI job board that flips the signal-to-noise ratio: applicants get pre-application feedback, recruiters get fewer-but-better-qualified applications.

---

## Overview

Pursuiter is a job-application platform with a twist on both sides:

- **For applicants** — paste your résumé and a job listing, and a Gemini-powered analyzer grades fit, surfaces missing skills, and suggests phrasing tweaks *before* you submit.
- **For recruiters** — set explicit minimum criteria (skills, years, education) and only see applications that meet the bar, with the AI's notes attached.

The point: cut the wasted time on both sides. Applicants stop blasting unfit roles; recruiters stop sifting through unqualified resumes.

---

## Why this exists

Built end-to-end as a personal full-stack project to learn the MERN stack with strict architectural separation (MVC) and to integrate an LLM (Gemini) behind a swappable adapter rather than calling the SDK from controllers.

---

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 |
| Backend | Node.js + Express |
| Database | MongoDB (via Mongoose) |
| Auth | JWT |
| AI | Google Gemini API (behind an adapter) |
| Tests | Jest + Supertest |

---

## Architecture

Strict three-layer Model-View-Controller:

- **Model** — Mongoose models in `/backend/models/` define the shape and validators. No business logic.
- **View** — React components in `/frontend/src/components/` are presentation only. No data fetching or business logic.
- **Controller** — Express controllers in `/backend/controllers/` hold all business logic. Each controller is responsible for one resource (Users, Jobs, Applications, AI).

The Gemini integration sits behind a thin adapter (`/backend/ai/`) so the model provider can be swapped without touching controller code or the React app.

---

## Key engineering decisions

1. **MVC separation as a hard rule.** No business logic in React; no presentation logic in controllers. This made the test surface easy to define — every business rule has a controller test, not a UI test.

2. **AI behind an adapter.** The Gemini call lives in one place. Want to A/B test against another model? Replace one file. The controller and the UI never know.

3. **Recruiter-set criteria as filters, not blockers.** Applicants still see jobs they don't quite fit (so they can grow into them) — the AI just tells them so up front. Only *submission* requires meeting the bar.

4. **JWT auth with httpOnly refresh tokens.** Standard separation; refresh tokens stored httpOnly to mitigate XSS exfiltration.

---

## Setup

### Prerequisites
- Node.js 22+
- MongoDB 7+
- Google Gemini API key

### Configure
Create `.env` files in `/backend` and `/frontend`:

```env
# backend/.env
MONGO_URI=mongodb://localhost:27017/pursuiter
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
GEMINI_API_KEY=YOUR_KEY
PORT=5000
```

```env
# frontend/.env
REACT_APP_API_URL=http://localhost:5000
```

### Run

```bash
# terminal 1: MongoDB (if not running as a service)
mongod --dbpath=./data/db

# terminal 2: backend
cd backend
npm install
npm run dev

# terminal 3: frontend
cd frontend
npm install
npm start
```

App: http://localhost:3000

### Test
```bash
cd backend
npm test
```

---

## Screenshots

*Landing*
![Landing](https://github.com/user-attachments/assets/c08e1bdb-8565-4079-b7dc-c4a48fe04f9c)

*Applicant dashboard*
![Applicant dashboard](https://github.com/user-attachments/assets/7c48bf33-c359-4f3b-9ca5-0e85f056887f)

*Recruiter dashboard*
![Recruiter dashboard](https://github.com/user-attachments/assets/594ae780-affd-4cbb-9844-d778db9a94c1)

*Recruiter applicant view*
![Recruiter applicant view](https://github.com/user-attachments/assets/415adc14-2915-41a9-9647-d529a92ac5a0)

---

## Project structure

```
Pursuiter/
├── backend/
│   ├── models/        # Mongoose schemas (no business logic)
│   ├── controllers/   # Express controllers (all business logic)
│   ├── routes/        # Route → controller wiring
│   ├── ai/            # Gemini adapter
│   ├── server.js      # App entry
│   └── tests/         # Jest + Supertest
├── frontend/
│   └── src/
│       ├── components/   # Presentation-only React
│       └── api/          # Fetch wrappers
└── README.md
```

---

## Contribution

Branching strategy: `dev` is the integration branch; feature branches branch from `dev`, named by ticket number. PRs go to `dev`, require one peer review, and `dev` merges to `main` at sprint boundaries.

### Code style

- React components live under `/frontend/src/components/<kebab-case>/` with a CamelCase JS + matching CSS file (e.g. `ApplicantDashboard.js` + `ApplicantDashboard.css`).
- Express controllers live under `/backend/controllers/` with CamelCase filenames (e.g. `UserController.js`).
- No business logic in React components; no presentation in controllers.

---

## License

Personal portfolio project.
