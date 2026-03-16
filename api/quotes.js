// Vercel Serverless Function: /api/quotes.js
// Proxies Yahoo Finance quote API for live prices.
// Uses v6 quote endpoint for real-time data including pre/post market.
// Falls back to v8 chart API if v6 is unavailable.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ALLOWED = ['^GSPC', '^VIX', '^TNX', '^TYX', '^IRX', '^DJI', '^IXIC', '^RUT', 'ES=F', 'BZ=F'];

  const raw = req.query.symbols || '^GSPC,^VIX,^TNX,^TYX,^IRX,ES=F,BZ=F';
  const requested = raw.split(',').map(s => s.trim()).filter(s => ALLOWED.includes(s));

  if (requested.length === 0) {
    return res.status(400).json({ error: 'No valid symbols. Use: ' + ALLOWED.join(', ') });
  }

  try {
    const results = {};
    const symbolsParam = requested.map(s => encodeURIComponent(s)).join(',');

    // Attempt 1: v6 quote endpoint (returns real-time prices including pre/post market)
    let v6Succeeded = false;
    try {
      const quoteUrl = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbolsParam}`;
      const resp = await fetch(quoteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        const quotes = data?.quoteResponse?.result || [];

        for (const q of quotes) {
          const symbol = q.symbol;
          if (!symbol) continue;

          // Use preMarketPrice or postMarketPrice when market is not in regular hours
          let livePrice = q.regularMarketPrice;
          if (q.marketState === 'PRE' && q.preMarketPrice) {
            livePrice = q.preMarketPrice;
          } else if ((q.marketState === 'POST' || q.marketState === 'POSTPOST') && q.postMarketPrice) {
            livePrice = q.postMarketPrice;
          }

          const prevClose = q.regularMarketPreviousClose || q.previousClose;

          results[symbol] = {
            symbol: symbol,
            name: q.shortName || q.longName || symbol,
            price: livePrice,
            previousClose: prevClose,
            change: livePrice && prevClose ? +(livePrice - prevClose).toFixed(4) : null,
            changePercent: livePrice && prevClose ? +(((livePrice - prevClose) / prevClose) * 100).toFixed(4) : null,
            dayHigh: q.regularMarketDayHigh || null,
            dayLow: q.regularMarketDayLow || null,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || null,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow || null,
            marketState: q.marketState || null,
            timestamp: q.regularMarketTime || null,
          };
        }

        v6Succeeded = requested.every(s => results[s] && !results[s].error);
      }
    } catch (e) {
      console.warn('v6 quote API failed, falling back to chart API:', e.message);
    }

    // Attempt 2: Chart API fallback for any missing symbols
    const missing = requested.filter(s => !results[s] || results[s].error);
    if (missing.length > 0) {
      await Promise.all(missing.map(async (symbol) => {
        try {
          const encoded = encodeURIComponent(symbol);
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1d&interval=1m&includePrePost=true`;

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
    }

    // Cache for 15 seconds (shorter for more real-time data)
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(results);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
