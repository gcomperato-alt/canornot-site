export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, mode } = req.body || {};

    if (!text || !mode) {
      return res.status(400).json({ error: "Missing text or mode" });
    }

    let instruction = "";

    if (mode === "singlish") {
      instruction = `
Rewrite the user's text into natural Singaporean Singlish.
Keep the meaning intact.
Make it sound local, clear, and human.
Do not overdo slang.
Do not turn everything into just "lah".
Return only the rewritten text.
`;
    } else if (mode === "standard") {
      instruction = `
Rewrite the user's text into clear, polished Standard English.
Keep the meaning intact.
Make it suitable for professional or neutral communication.
Return only the rewritten text.
`;
    } else if (mode === "both") {
      instruction = `
You will rewrite the user's text in two ways.

1) Singlish:
Natural Singaporean Singlish, local but still clear, not cartoonish, not overloaded with particles.

2) Standard English:
Clear, polished, professional English.

Return valid JSON only in this shape:
{
  "singlish": "....",
  "standard": "...."
}
`;
    } else {
      return res.status(400).json({ error: "Invalid mode" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        input: [
          { role: "system", content: instruction },
          { role: "user", content: text }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI request failed"
      });
    }

    return res.status(200).json({
      output: data.output_text || ""
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
}
