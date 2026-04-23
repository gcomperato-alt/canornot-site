export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'Missing OPENAI_API_KEY in Vercel environment variables.'
    });
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    const text = (body.text || '').trim();
    const mode = body.mode || 'both';
    const sgModeOn = body.sgModeOn !== false;

    if (!text) {
      return res.status(400).json({ error: 'Missing text.' });
    }

    const systemPrompt = `You are the hidden reasoning layer of a prompt-improvement and answer-routing system.

Your job is to help rewrite user input cleanly and usefully.

Modes:
- singlish: rewrite with light natural Singapore flavour
- standard: rewrite into clear standard English
- both: return both versions

Rules:
1. Preserve the user's intent.
2. Keep the output concise, practical, and readable.
3. Do not add explanations unless explicitly asked.
4. Break long outputs into proper paragraphs.
5. For Singlish, keep it natural and light, not exaggerated.
6. For standard English, make it clearer for ChatGPT or normal use.
7. Return JSON only.`;

    const userPrompt = `Rewrite this input.

Input:
${text}

Requested mode: ${mode}
Singapore mode enabled: ${sgModeOn ? 'yes' : 'no'}

Return JSON in this exact shape:
{
  "standard": "....",
  "singlish": "....",
  "detectedMode": "standard|singlish|both"
}`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const raw = await openaiRes.text();

    if (!openaiRes.ok) {
      return res.status(openaiRes.status).json({
        error: 'OpenAI request failed.',
        details: raw
      });
    }

    let parsedOuter;
    try {
      parsedOuter = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: 'Could not parse OpenAI outer response.',
        details: raw
      });
    }

    const content = parsedOuter?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({
        error: 'OpenAI returned no message content.',
        details: parsedOuter
      });
    }

    let parsedInner;
    try {
      parsedInner = JSON.parse(content);
    } catch {
      parsedInner = {
        standard: mode === 'singlish' ? '' : content,
        singlish: mode === 'standard' ? '' : content,
        detectedMode: mode
      };
    }

    return res.status(200).json({
      standard: parsedInner.standard || '',
      singlish: parsedInner.singlish || '',
      detectedMode: parsedInner.detectedMode || mode
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Server error.',
      details: err instanceof Error ? err.message : String(err)
    });
  }
}
