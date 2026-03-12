# Markets Dashboard

A real-time financial markets dashboard showing U.S. equity indices, Treasury yields, volatility, E-mini futures, central bank policy rates, and benchmark reference rates. Built as a single-page static site with a Vercel serverless proxy for Yahoo Finance data.

**Live site:** [markets-dashboard-phi.vercel.app](https://markets-dashboard-phi.vercel.app/)

## What it shows

- **S&P 500 Index** (^GSPC) — broad U.S. equity benchmark
- **CBOE Volatility Index** (^VIX) — market fear gauge
- **S&P 500 E-mini Futures** (ES=F) — overnight/pre-market futures price
- **10-Year Treasury Yield** (^TNX) — benchmark long-term rate
- **30-Year Treasury Yield** (^TYX) — long bond yield
- **4-Week Treasury Bill Yield** (^IRX) — near-cash rate
- **Federal Funds Rate** — Fed policy rate (static, updated after FOMC meetings)
- **ECB Main Refinancing Rate** — European policy rate (static)
- **SOFR** — primary USD overnight benchmark rate (static)
- **LIBOR** — discontinued fallback rate (static, for reference)

## Architecture

```
markets-dashboard/
├── index.html          # Single-page dashboard (HTML + CSS + JS)
├── api/
│   └── quotes.js       # Vercel serverless function (Yahoo Finance proxy)
├── .gitignore
└── package-lock.json
```

The dashboard is a static HTML file with embedded CSS and JavaScript. No build step, no framework, no bundler. The JavaScript polls `/api/quotes` every 30 seconds for live market data.

The serverless function (`api/quotes.js`) exists because Yahoo Finance blocks browser-side requests via CORS. It proxies the Yahoo Finance v6 quote API (with a v8 chart API fallback) and returns clean JSON.

## Data flow

1. Browser loads `index.html` — cards show "—" placeholders
2. JavaScript calls `/api/quotes?symbols=^GSPC,^VIX,^TNX,^TYX,^IRX,ES=F`
3. Serverless function fetches Yahoo Finance v6 quote API (real-time prices)
4. If v6 fails for any symbol, falls back to v8 chart API (1-minute candles)
5. Response cached at Vercel edge for 15 seconds
6. JavaScript updates card prices, change values, and 52-week range bars
7. Repeats every 30 seconds

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`)
- A GitHub account (for deployment)

### Local development

```bash
git clone https://github.com/ArchonGraceland/markets-dashboard.git
cd markets-dashboard
vercel dev
```

This starts a local server (usually `http://localhost:3000`) with the serverless function available at `/api/quotes`.

### Deploy to Vercel

**First time:**

```bash
vercel --prod
```

Follow the prompts — no framework, no build command, root directory is `.`.

**Subsequent deploys (with GitHub connected):**

```bash
git add -A
git commit -m "your message"
git push
```

Vercel auto-deploys from `main` when GitHub integration is connected.

**Manual redeploy:**

```bash
vercel --prod
```

### If the deploy seems stuck or cached

```bash
vercel pull --yes
vercel build --prod
vercel deploy --prebuilt --prod
```

## API reference

### `GET /api/quotes`

Returns real-time quotes from Yahoo Finance.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `symbols` | `^GSPC,^VIX,^TNX,^TYX,^IRX,ES=F` | Comma-separated Yahoo Finance symbols |

**Allowed symbols:** `^GSPC`, `^VIX`, `^TNX`, `^TYX`, `^IRX`, `^DJI`, `^IXIC`, `^RUT`, `ES=F`

**Example response:**

```json
{
  "^GSPC": {
    "symbol": "^GSPC",
    "name": "S&P 500",
    "price": 6747.75,
    "previousClose": 6779.5,
    "change": -31.75,
    "changePercent": -0.4683,
    "dayHigh": 6769.5,
    "dayLow": 6705.75,
    "fiftyTwoWeekHigh": 7043,
    "fiftyTwoWeekLow": 4832,
    "marketState": "PRE",
    "timestamp": 1773307437
  }
}
```

**Caching:** 15-second edge cache with 30-second stale-while-revalidate.

## Static sections

The central bank rates (Fed, ECB) and benchmark reference rates (SOFR, LIBOR) are hardcoded in `index.html` and do not update automatically. These change only at scheduled policy meetings and should be manually updated when decisions are announced.

## Design

- **Fonts:** Roboto (UI labels) + Crimson Text (prices, headings)
- **Colors:** Navy (#1a3a6b) header, white cards, semantic colors for asset classes
- **Responsive:** 2-column grid on desktop, single column below 800px
- **Accessibility:** WCAG AA contrast, focus-visible outlines, semantic HTML

## License

Not specified. For personal use.
