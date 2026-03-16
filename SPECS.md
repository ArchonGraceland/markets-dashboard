# SPECS.md — Markets Dashboard Technical Specification

## 1. Overview

A single-page financial dashboard that displays near-real-time U.S. market data (equities, volatility, futures, treasuries, crude oil) alongside static central bank policy rates. Deployed on Vercel as a static site with one serverless function.

## 2. System requirements

| Component | Requirement |
|-----------|-------------|
| Runtime | Vercel serverless (Node.js 18+) |
| Hosting | Vercel (free tier sufficient) |
| External API | Yahoo Finance (no API key required) |
| Browser support | Modern browsers with ES2017+ support |
| Build step | None (static HTML) |

## 3. File structure

```
markets-dashboard/
├── index.html            # Dashboard UI + client-side polling logic
├── api/
│   └── quotes.js         # Vercel serverless proxy for Yahoo Finance
├── .gitignore            # Excludes .vercel/
├── package-lock.json     # Empty lockfile (no dependencies)
├── README.md             # Project overview and setup
└── SPECS.md              # This file
```

## 4. Serverless API — `/api/quotes.js`

### 4.1 Purpose

Proxies Yahoo Finance because the browser cannot call Yahoo directly (CORS blocked). Runs as a Vercel serverless function at `/api/quotes`.

### 4.2 Request

```
GET /api/quotes?symbols=^GSPC,^VIX,ES=F,BZ=F,CL=F
```

- Method: GET only (405 for others)
- `symbols`: comma-separated list from the allowlist
- Default: `^GSPC,^VIX,^TNX,^TYX,^IRX,ES=F,BZ=F,CL=F`

### 4.3 Symbol allowlist

| Symbol | Description | Card ID |
|--------|-------------|---------|
| `^GSPC` | S&P 500 Index | SPX |
| `^VIX` | CBOE Volatility Index | VIX |
| `ES=F` | E-mini S&P 500 Futures | ES |
| `^TNX` | 10-Year Treasury Yield | US10Y |
| `^TYX` | 30-Year Treasury Yield | US30Y |
| `^IRX` | 13-Week T-Bill Yield | US4W |
| `BZ=F` | Brent Crude Oil Futures | BRENT |
| `CL=F` | WTI Crude Oil Futures | WTI |
| `^DJI` | Dow Jones Industrial Average | (reserved) |
| `^IXIC` | Nasdaq Composite | (reserved) |
| `^RUT` | Russell 2000 | (reserved) |

### 4.4 Data sourcing strategy

**Primary:** Yahoo Finance v6 quote API
- Endpoint: `https://query1.finance.yahoo.com/v6/finance/quote?symbols=...`
- Returns real-time prices including pre-market and post-market
- Single request for all symbols

**Fallback:** Yahoo Finance v8 chart API
- Endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1m&includePrePost=true`
- Used only if v6 fails or returns incomplete data
- One request per missing symbol

### 4.5 Price resolution logic

For each symbol, the API selects the most current price available:

1. If `marketState === 'PRE'` and `preMarketPrice` exists → use `preMarketPrice`
2. If `marketState === 'POST'` or `'POSTPOST'` and `postMarketPrice` exists → use `postMarketPrice`
3. Otherwise → use `regularMarketPrice`

Change and changePercent are computed against `regularMarketPreviousClose`.

### 4.6 Response format

```json
{
  "<symbol>": {
    "symbol": "string",
    "name": "string",
    "price": "number",
    "previousClose": "number",
    "change": "number (4 decimal places)",
    "changePercent": "number (4 decimal places)",
    "dayHigh": "number | null",
    "dayLow": "number | null",
    "fiftyTwoWeekHigh": "number | null",
    "fiftyTwoWeekLow": "number | null",
    "marketState": "string | null",
    "timestamp": "number (unix seconds) | null"
  }
}
```

On error for a specific symbol: `{ "<symbol>": { "error": "message" } }`

### 4.7 Caching

- Edge cache: `s-maxage=15` (15 seconds)
- Stale-while-revalidate: 30 seconds
- CORS: `Access-Control-Allow-Origin: *`

## 5. Client-side — `index.html`

### 5.1 Architecture

Single HTML file containing all CSS (in `<style>`) and JavaScript (in `<script>`). No external JS dependencies. Google Fonts loaded via CDN (Roboto + Crimson Text).

### 5.2 Card mapping

The `CARD_MAP` object maps dashboard card IDs to Yahoo Finance symbols:

```javascript
const CARD_MAP = {
  SPX:   { yf: '^GSPC', isYield: false },
  VIX:   { yf: '^VIX',  isYield: false },
  ES:    { yf: 'ES=F',  isYield: false },
  US10Y: { yf: '^TNX',  isYield: true  },
  US30Y: { yf: '^TYX',  isYield: true  },
  US4W:  { yf: '^IRX',  isYield: true  },
  BRENT: { yf: 'BZ=F',  isYield: false },
  WTI:   { yf: 'CL=F',  isYield: false },
};
```

### 5.3 Polling behavior

- First fetch fires immediately on page load
- Subsequent fetches every 30 seconds via `setInterval`
- Status indicator in header: green (live), yellow (connecting), red (error)

### 5.4 Rendering logic

**Equity/Vol/Futures/Commodity cards** (`isYield: false`):
- Price displayed with 2 decimal places, comma-separated thousands
- Change shown as absolute value and percentage with +/− prefix
- Green for positive, red for negative
- Flash animation on price change (green flash up, red flash down)
- 52-week range bar updated from API's `fiftyTwoWeekHigh`/`fiftyTwoWeekLow`

**Yield cards** (`isYield: true`):
- Price displayed with 3 decimal places followed by `%` unit
- Change shown as absolute basis points and percentage
- 52-week range bar updated from API data

### 5.5 Initial state

All cards show "—" as the price and "Waiting for data…" as the change text until the first successful API response. Range bars start at 0%.

## 6. Dashboard sections

### 6.1 Equities, Volatility, Futures & Commodities (live)

| Card | Symbol | Type | Badge | Left border |
|------|--------|------|-------|-------------|
| S&P 500 Index | ^GSPC | equity | Index (navy) | Navy |
| CBOE Volatility Index | ^VIX | vol | Volatility (amber) | Amber |
| S&P 500 E-mini Futures | ES=F | futures | Futures (blue) | Blue |
| 10-Year Treasury Yield | ^TNX | bond | Treasury (green) | Green |
| 30-Year Treasury Yield | ^TYX | bond | Treasury (green) | Green |
| 4-Week T-Bill Yield | ^IRX | bond | T-Bill (green) | Green |
| Brent Crude Oil Futures | BZ=F | commodity | Commodity (oil) | Oil brown |
| WTI Crude Oil Futures | CL=F | commodity | Commodity (oil) | Oil brown |

Each card displays: symbol badge, full name, current price, change (absolute + percent), timestamp, and a 52-week range bar.

### 6.2 Central Bank Policy Rates (static)

| Card | Institution | Current value |
|------|-------------|---------------|
| Federal Funds Rate | Federal Reserve | 3.64% (range 3.50–3.75%) |
| Main Refinancing Rate | ECB | 2.15% |

Each card displays: institution label, rate name, status badge, headline rate, rate range/details, and a 2-column detail grid with last decision, next meeting, inflation data, and market expectations.

**Update cadence:** Manual edit of `index.html` after each FOMC or ECB meeting.

## 7. Design system

### 7.1 Typography

| Usage | Font | Weight | Size |
|-------|------|--------|------|
| Prices, headings | Crimson Text | 700 | 40px (cards), 52px (rates) |
| Labels, badges, UI | Roboto | 400–700 | 10–14px |
| Body text | Crimson Text | 400 | 18px |

### 7.2 Color palette

| Name | Hex | Usage |
|------|-----|-------|
| Navy | #1a3a6b | Header, equity accent |
| Navy dark | #112a4f | Header border |
| Green | #166534 | Positive change, bond accent |
| Red | #991b1b | Negative change |
| Amber | #92400e | Volatility accent |
| Blue | #2563eb | Futures accent, ECB |
| Oil brown | #854d0e | Commodity accent |
| Fed red | #9f1239 | Federal Reserve accent |

### 7.3 Layout

- Max width: 1120px, centered
- Card grid: 2 columns, 20px gap
- Responsive breakpoint at 800px → single column
- Cards: white background, 1px border, 6px radius, left 4px color accent

### 7.4 Accessibility

- WCAG AA contrast ratios throughout
- `:focus-visible` outlines on interactive elements
- Semantic HTML (`<header>`, `<main>`, `<footer>`)
- No JavaScript required for static content visibility

## 8. Known limitations

- **Yahoo Finance rate limits:** No official API key; relies on unofficial endpoints that may change or throttle without notice.
- **Futures contract rollover:** `ES=F`, `BZ=F`, and `CL=F` point to the front-month contract. Near expiration, the symbol automatically rolls to the next contract.
- **No WebSocket:** Polling-based (30s intervals), not streaming. Prices may lag by up to 30 seconds plus Yahoo's own delay.
- **Static policy rates:** Fed and ECB values require manual HTML edits.
- **No error recovery UI:** If the API returns errors persistently, cards remain in their last known state with no user-facing error message beyond the header status dot turning red.
- **Single file:** All HTML, CSS, and JS in one file. Fine for current scope but would benefit from separation if the project grows.

## 9. Future considerations

- Add WebSocket or SSE for true real-time streaming
- Auto-update policy rates from FRED API
- Add DJI, Nasdaq, Russell 2000 cards (symbols already in allowlist)
- Add currency pairs (DXY, EUR/USD)
- Add more commodity prices (gold, natural gas)
- Historical sparkline charts in cards
- Dark mode toggle
- Service worker for offline static content

## 10. Changelog

| Date | Change |
|------|--------|
| Mar 16, 2026 | Removed LIBOR card and Benchmark Reference Rates section (SOFR). Added Brent Crude Oil (BZ=F) and WTI Crude Oil (CL=F) as live market cards with commodity styling. |
| Mar 10–11, 2026 | Initial live deployment with 6 market cards, 2 central bank rates, SOFR, and LIBOR. |
