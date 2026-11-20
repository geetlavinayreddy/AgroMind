import { NextResponse } from "next/server";

type ChatRequest = {
  message?: string;
  field?: {
    crop?: string;
    district?: string;
    soil?: string;
    moisture?: string;
    rain?: string;
    issue?: string;
  };
};

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message || message.length > 1500) {
    return NextResponse.json({ error: "A valid message is required" }, { status: 400 });
  }

  const field = body.field || {};
  const fallback =
    "I can help organize the question, but I do not have enough verified field evidence yet. " +
    "Use the field workspace, confirm soil and weather readings, and ask a local agronomist before consequential action.";
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ reply: fallback });

  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const prompt =
      "You are AgroMind's agricultural assistant. Give concise, evidence-aware guidance. " +
      "Do not invent pesticide doses, prices or guaranteed outcomes. " +
      "If information is missing, ask for the next field check. " +
      `Field context: crop=${field.crop || "unknown"}, district=${field.district || "unknown"}, ` +
      `soil=${field.soil || "unknown"}, moisture=${field.moisture || "unknown"}%, ` +
      `rain=${field.rain || "unknown"}mm, observed_issue=${field.issue || "unknown"}. ` +
      `Farmer question: ${message}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 240 },
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) return NextResponse.json({ reply: fallback });
    const data = await response.json();
    const reply =
      data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim() || fallback;
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ reply: fallback });
  }
}
