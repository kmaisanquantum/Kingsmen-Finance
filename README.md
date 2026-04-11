# Our Finance — Loan Management System

A full-stack web application for digital lending in Papua New Guinea. Built with Node.js/Express backend and a pure HTML/CSS/JS frontend.

---

## Features

- **AI Document Extraction** — Upload PNG NID/Passport + Payslip; Claude Vision extracts name, document details, and net pay automatically
- **Manual Entry Mode** — Fast underwriting without document uploads
- **Real-time Underwriting Engine** — 20% p.a. reducing balance, 30% debt-to-income ratio enforcement
- **Live EMI Calculator** — Updates instantly as you type
- **Amortization Schedule** — Full period-by-period repayment breakdown
- **Responsive Design** — Works on desktop and mobile

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| AI Extraction | Anthropic Claude API (Vision) |
| File Handling | Multer (memory storage) |
| Security | Helmet, Rate Limiting, CORS |
| Frontend | Vanilla HTML/CSS/JS |
| Fonts | Playfair Display, DM Mono, Crimson Pro |

---

## Setup

### 1. Prerequisites
- Node.js 18+
- npm

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
NODE_ENV=development
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

> **Note:** The app works without an API key — AI extraction will be disabled and you can use Manual Entry mode. Get an API key at https://console.anthropic.com

### 4. Run the App

**Development (with auto-restart):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Visit `http://localhost:3000`

---

## API Reference

### `GET /api/health`
Returns server status and AI configuration.

### `POST /api/loan/calculate`
Quick EMI calculation without underwriting.

**Body:**
```json
{ "principal": 1000, "term": 4 }
```

### `POST /api/loan/assess`
Full underwriting assessment (manual mode).

**Body:**
```json
{
  "name": "Peter Kila Namaliu",
  "net_fortnightly_pay": 2800,
  "doc_type": "PNG NID",
  "doc_number": "NID-892341",
  "doc_expired": false,
  "employer": "PNG Power Ltd",
  "requested_amount": 1500,
  "term": 8,
  "purpose": "Education & School Fees"
}
```

### `POST /api/extract/assess`
AI-powered document extraction + underwriting.

**Form Data:**
- `id_document` — Image/PDF of NID or Passport
- `payslip` — Image/PDF of most recent payslip
- `requested_amount` — Loan amount requested
- `term` — Repayment term in fortnights
- `purpose` — Loan purpose (optional)

*Requires `ANTHROPIC_API_KEY` to be set.*

---

## Business Rules

| Parameter | Value |
|-----------|-------|
| Minimum Loan | K100 |
| Maximum Loan | K2,500 |
| Interest Rate | 20% per annum (reducing balance) |
| Repayment Cycle | Fortnightly (26 per year) |
| Max Debt Ratio | 30% of net fortnightly pay |
| Fortnightly Rate | 0.7692% (20% ÷ 26) |

### EMI Formula
```
EMI = [P × r × (1+r)^n] / [(1+r)^n − 1]

Where:
  P = Principal
  r = 0.007692 (fortnightly rate)
  n = Number of fortnights
```

---

## Project Structure

```
kingsmen-finance/
├── server.js              # Express app entry point
├── package.json
├── .env.example
├── routes/
│   ├── loan.js            # /api/loan/* endpoints
│   └── extract.js         # /api/extract/* (AI) endpoints
├── utils/
│   └── underwriting.js    # Core math & decision engine
└── public/
    ├── index.html         # Single page application
    ├── css/
    │   └── style.css
    └── js/
        └── app.js         # Frontend logic
```

---

## License
MIT — Our Finance, Port Moresby, Papua New Guinea
