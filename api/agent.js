export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders()
  });
}

export async function POST(request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return jsonResponse(
      {
        error: 'Missing OPENAI_API_KEY in Vercel environment variables.'
      },
      500
    );
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        error: 'Invalid JSON body.'
      },
      400
    );
  }

  const text = (body.text || '').trim();
  const mode = body.mode || 'both';
  const sgModeOn = body.sgModeOn !== false;

  if (!text) {
    return jsonResponse(
      {
        error: 'Missing text.'
      },
      400
    );
  }

  const systemPrompt = `
You are the hidden reasoning layer of a prompt-improvement and answer-routing system.

Your job is to classify the user's input and return the correct kind of output.

Route modes:
- ANSWER = the user asked a direct question with enough context
- REFORMULATE = the user wrote a rough prompt or unclear wording that should be improved
- ASK = critical context is missing
- PASS = already usable with minimal change

Output rules:
1. Always preserve user intent.
2. If the route is ANSWER:
   - "standard" must be the actual answer in clear standard English.
   - "singlish" must be the same answer in light natural Singlish if possible.
3. If the route is REFORMULATE or PASS:
   - "standard" must be a cleaner standard-English prompt or phrasing.
   - "singlish" must be a natural Singlish rewrite.
4. If the route is ASK:
   - "standard" must be a short clarifying question.
   - "singlish" must be the same clarifying question in light natural Singlish.
5. For Singlish, keep it light, readable, and human. Do not overdo particles.
6. For standard English, use short readable paragraphs.
7. Do not include explanations outside the JSON.
8. Return valid JSON only.

Return JSON in exactly this shape:
{
  "route": {
    "mode": "ANSWER" | "REFORMULATE" | "ASK" | "PASS",
    "reason": "short explanation"
  },
  "standard": "string",
  "singlish": "string",
  "source": "openai"
}
  `.trim();

  const userPrompt = `
User input:
${text}

Interface mode requested:
${mode}

Singapore mode enabled:
${sgModeOn ? 'yes' : 'no'}

Important:
- If the user is asking for factual information, answer it directly.
- Do not merely rewrite a direct factual question unless the route is REFORMULATE or PASS.
- Keep the answer concise but useful.
- Return JSON only.
  `.trim();

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const raw = await openaiRes.text();

    if (!openaiRes.ok) {
      return jsonResponse(
        {
          error: 'OpenAI request failed.',
          details: raw
        },
        openaiRes.status
      );
    }

    let outer;
    try {
      outer = JSON.parse(raw);
    } catch {
      return jsonResponse(
        {
          error: 'Could not parse OpenAI outer response.',
          details: raw
        },
        500
      );
    }

    const content = outer?.choices?.[0]?.message?.content;

    if (!content) {
      return jsonResponse(
        {
          error: 'OpenAI returned no message content.',
          details: outer
        },
        500
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return jsonResponse(
        {
          error: 'Model did not return valid JSON.',
          details: content
        },
        500
      );
    }

    return jsonResponse({
      route: {
        mode: parsed?.route?.mode || 'PASS',
        reason: parsed?.route?.reason || 'No reason returned.'
      },
      standard: parsed?.standard || '',
      singlish: parsed?.singlish || '',
      source: parsed?.source || 'openai'
    });
  } catch (err) {
    return jsonResponse(
      {
        error: 'Server error.',
        details: err instanceof Error ? err.message : String(err)
      },
      500
    );
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}
