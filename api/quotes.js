// Vercel Serverless Function: /api/quotes.js
// Proxies Yahoo Finance v8 chart API for index symbols that can't be fetched
// client-side due to CORS. Returns clean JSON for the dashboard.

export default async function handler(req, res) {
  // Allow GET only
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Symbols we support — all Yahoo Finance index tickers
  const ALLOWED = ['^GSPC', '^VIX', '^TNX', '^TYX', '^IRX', '^DJI', '^IXIC', '^RUT'];
  
  // Accept ?symbols=^GSPC,^VIX,^TNX  (comma-separated)
  const raw = req.query.symbols || '^GSPC,^VIX,^TNX,^TYX,^IRX';
  const requested = raw.split(',').map(s => s.trim()).filter(s => ALLOWED.includes(s));

  if (requested.length === 0) {
    return res.status(400).json({ error: 'No valid symbols. Use: ' + ALLOWED.join(', ') });
  }

  try {
    const results = {};

    // Fetch each symbol from Yahoo Finance v8 chart API
    await Promise.all(requested.map(async (symbol) => {
      try {
        const encoded = encodeURIComponent(symbol);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d&includePrePost=false`;
        
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!resp.ok) {
          results[symbol] = { error: `HTTP ${resp.status}` };
          return;
        }

        const data = await resp.json();
        const result = data?.chart?.result?.[0];
        if (!result) {
          results[symbol] = { error: 'No data' };
          return;
        }

        const meta = result.meta || {};
        const closes = result.indicators?.quote?.[0]?.close || [];
        const timestamps = result.timestamp || [];

        // Get last valid close and previous close
        const validCloses = closes.filter(c => c !== null);
        const currentPrice = meta.regularMarketPrice || validCloses[validCloses.length - 1];
        const previousClose = meta.chartPreviousClose || meta.previousClose || validCloses[validCloses.length - 2];

        results[symbol] = {
          symbol: symbol,
          name: meta.shortName || meta.longName || symbol,
          price: currentPrice,
          previousClose: previousClose,
          change: currentPrice && previousClose ? +(currentPrice - previousClose).toFixed(4) : null,
          changePercent: currentPrice && previousClose ? +(((currentPrice - previousClose) / previousClose) * 100).toFixed(4) : null,
          dayHigh: meta.regularMarketDayHigh || null,
          dayLow: meta.regularMarketDayLow || null,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow || null,
          marketState: meta.marketState || null,
          timestamp: meta.regularMarketTime || null,
        };
      } catch (e) {
        results[symbol] = { error: e.message };
      }
    }));

    // Cache for 30 seconds
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(results);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
