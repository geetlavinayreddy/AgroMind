import { NextResponse } from "next/server";

type ChatHistoryEntry = {
  role: "user" | "assistant";
  text: string;
};

type FieldContext = {
  crop?: string;
  district?: string;
  farmSize?: string;
  soilType?: string;
  irrigation?: string;
  moisture?: string;
  recentRain?: string;
  issue?: string;
};

type ChatAnalysis = {
  agents: { agent: string; status: string; summary: string }[];
  plan: string[];
  warnings: string[];
  sources: { name: string; status: string }[];
};

const MAX_MESSAGE_LENGTH = 1500;
const MAX_IMAGE_LENGTH = 11_200_000;

const SYSTEM_INSTRUCTIONS = `You are AgroMind, a practical, careful agricultural assistant. Help farmers with crop symptoms, likely causes, checks, prevention, irrigation, soil, harvest, and market questions. Be direct and useful: do not answer with a bare refusal or generic "consult an expert." Give safe immediate actions, explain what evidence is missing, and ask at most two focused follow-up questions when they would change the recommendation.

For crop problems, organize the answer under: likely causes (as possibilities, not a confirmed diagnosis), why they fit or do not fit, what to inspect/do now, prevention, and treatment/product guidance. Use only the farmer's details, the uploaded image, and the specialist summaries provided in this conversation. An image or symptom description alone is not a laboratory diagnosis. Separate observations from hypotheses; do not invent facts, live weather/market data, source citations, product registrations, or label instructions.

For pesticide, fungicide, herbicide, or other crop-treatment product requests, never invent a brand, active ingredient, dose, tank mix, schedule, pre-harvest interval, or re-entry interval. Do not recommend human or veterinary medicine. Explain that product choice depends on confirmed pest/disease, crop, location, and the current local label. Give the farmer a concrete safe route: take the crop and symptom details to a licensed agricultural-input retailer or local agricultural extension/KVK/agriculture department, request a product registered for that exact crop and target, and check the sealed original pack, registration, expiry, PPE, and label directions before use. If no diagnosis is available, advise against spraying until the cause is checked.

Treat previous specialist outputs as provisional unless they include clearly dated, attributable evidence. Never claim that a source was checked live unless the provided context says so. Be concise but complete. Reply in the requested language when practical; otherwise use clear English.`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function stringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, 400))
    .filter(Boolean);
}

function parseHistory(value: unknown): ChatHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((item) => {
    const entry = asRecord(item);
    if (
      !entry ||
      (entry.role !== "user" && entry.role !== "assistant") ||
      typeof entry.text !== "string"
    ) {
      return [];
    }
    return [{ role: entry.role, text: entry.text.trim().slice(0, 1500) }];
  });
}

function parseField(value: unknown): FieldContext {
  const field = asRecord(value);
  if (!field) return {};
  return {
    crop: boundedText(field.crop, 120),
    district: boundedText(field.district, 120),
    farmSize: boundedText(field.farmSize, 80),
    soilType: boundedText(field.soilType, 120),
    irrigation: boundedText(field.irrigation, 120),
    moisture: boundedText(field.moisture, 80),
    recentRain: boundedText(field.recentRain, 80),
    issue: boundedText(field.issue, 300),
  };
}

function parseAnalysis(value: unknown): ChatAnalysis | undefined {
  const analysis = asRecord(value);
  if (!analysis) return undefined;

  const agents = Array.isArray(analysis.agents)
    ? analysis.agents.slice(0, 6).flatMap((item) => {
        const agent = asRecord(item);
        if (!agent) return [];
        const name = boundedText(agent.agent, 100);
        const status = boundedText(agent.status, 50);
        const summary = boundedText(agent.summary, 800);
        return name && status && summary ? [{ agent: name, status, summary }] : [];
      })
    : [];
  const sources = Array.isArray(analysis.sources)
    ? analysis.sources.slice(0, 8).flatMap((item) => {
        const source = asRecord(item);
        if (!source) return [];
        const name = boundedText(source.name, 120);
        const status = boundedText(source.status, 80);
        return name && status ? [{ name, status }] : [];
      })
    : [];

  return {
    agents,
    plan: stringList(analysis.plan, 8),
    warnings: stringList(analysis.warnings, 8),
    sources,
  };
}

function offlineReply(message: string, field: FieldContext): string {
  const question = message.toLowerCase();
  const crop = field.crop || "your crop";
  const issue = field.issue || "the reported problem";

  if (/market|price|sell|mandi|profit|rate/.test(question)) {
    return `For ${crop}, compare today's dated prices for the same variety, grade, and market—not a general crop average. Check at least two nearby markets or your official/local mandi source, and include transport, commission, and quality deductions before deciding where to sell. I don't have live market prices in this offline response. Share your district, crop variety, grade, and intended sale date for a more useful comparison.`;
  }

  if (/water|irrigat|rain|moisture|drip/.test(question)) {
    return `For ${crop}, check moisture in the root zone at more than one spot and consider soil type, crop stage, recent rain, and drainage before irrigating. Avoid adding water to already saturated soil; look for wilting in the morning as well as midday, since midday-only wilting can have other causes. Don't change irrigation solely from a general schedule. Share the crop stage, soil type, and recent rainfall/irrigation for a tailored plan.`;
  }

  if (/fertiliz|nutrient|soil|nitrogen|npk|yellow/.test(question)) {
    return `For ${crop}, yellowing or poor growth can come from several causes, including nutrient imbalance, root/water stress, pests, or disease. Check whether symptoms are on old or new leaves, whether they are uniform or patchy, and whether roots/drainage look healthy. A recent soil test (pH and nutrients) is safer than guessing a fertilizer dose; avoid adding extra fertilizer until the cause is clearer. Share crop stage, symptom pattern, and any soil-test result.`;
  }

  return `For ${crop}, ${issue} is not enough on its own to confirm a cause. Check several affected and healthy plants, photograph the whole plant plus close-ups of both leaf surfaces, note where symptoms began and how quickly they spread, and check recent rain, irrigation, and any spray/fertilizer history. Possible causes can include pests, disease, nutrient stress, or water/root stress; the pattern and a clear photo help distinguish them.`;
}

function offlineFollowUp(message: string): string {
  const question = message.toLowerCase();
  if (/market|price|sell|mandi|profit|rate/.test(question)) {
    return "Share your district, crop variety, produce grade, and intended sale date.";
  }
  if (/water|irrigat|rain|moisture|drip/.test(question)) {
    return "Share crop stage, soil type, root-zone moisture, and recent rainfall/irrigation.";
  }
  if (/fertiliz|nutrient|soil|nitrogen|npk/.test(question)) {
    return "Share crop stage, whether old or new leaves are affected, and any recent soil-test result.";
  }
  return "Share the crop and growth stage, district, when it started, and a clear photo if available.";
}

function offlineResponse(
  message: string,
  field: FieldContext,
  notice: string,
  language?: string,
) {
  const crop = field.crop || "the crop";
  const needsProductGuidance =
    /pesticide|medicine|spray|fungicide|insecticide|herbicide|disease|pest|spot|yellow|wilt|rot|symptom|crop problem|treatment|product|cause|leaf/.test(
      message.toLowerCase(),
    );
  const productGuidance = needsProductGuidance
    ? `\n\nTreatment/products: don't spray or buy a pesticide based only on a symptom. For a product-specific choice, take the crop, location, and clear photos to a licensed agricultural-input retailer or local agricultural extension/KVK/agriculture department. Ask for a product registered for that exact crop and confirmed target, then check the sealed pack, expiry, PPE, and current label.`
    : "";
  const followUp = `\n\nTo narrow this down, ${offlineFollowUp(message)}`;

  return NextResponse.json({
    reply: `${offlineReply(message, field)}${productGuidance}${followUp}`,
    mode: "offline",
    notice: `${notice} No live source or product-label verification was performed for ${crop}.${language && language !== "English" ? " Offline guidance is currently in English." : ""}`,
  });
}

function parseModelReply(value: unknown): string {
  const data = asRecord(value);
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const firstCandidate = asRecord(candidates[0]);
  const content = asRecord(firstCandidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts
    .flatMap((part) => {
      const text = asRecord(part)?.text;
      return typeof text === "string" ? [text] : [];
    })
    .join("")
    .trim();
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const body = asRecord(rawBody);
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json(
      { error: "A non-empty message is required." },
      { status: 400 },
    );
  }
  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: "Messages must be at most 1,500 characters." },
      { status: 400 },
    );
  }
  const message = body.message.trim();

  const field = parseField(body.field);
  const history = parseHistory(body.history);
  const analysis = parseAnalysis(body.analysis);
  const language = boundedText(body.language, 40);
  if (body.image !== undefined && body.image !== null && typeof body.image !== "string") {
    return NextResponse.json({ error: "Image data must be a JPEG, PNG, or WebP data URL." }, { status: 400 });
  }
  const image = typeof body.image === "string" ? body.image : undefined;

  if (image && image.length > MAX_IMAGE_LENGTH) {
    return NextResponse.json(
      { error: "The image is too large for chat. Please use an image under 8 MB." },
      { status: 413 },
    );
  }

  const imageMatch = image?.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (image && !imageMatch) {
    return NextResponse.json(
      { error: "Chat images must be valid JPEG, PNG, or WebP files." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return offlineResponse(
      message,
      field,
      "The live AI model is not configured; general safe guidance is shown instead.",
      language,
    );
  }

  const fieldAndAnalysis = [
    `Farmer-provided field context: ${JSON.stringify(field)}`,
    analysis
      ? `Current specialist summaries and source status (treat as provisional): ${JSON.stringify(analysis)}`
      : "No specialist analysis is available for this conversation.",
  ].join("\n");
  const turns = history.reduce<{ role: "user" | "model"; text: string }[]>((current, entry) => {
    const role = entry.role === "assistant" ? "model" : "user";
    const previous = current[current.length - 1];
    if (previous?.role === role) {
      previous.text = `${previous.text}\n${entry.text}`;
    } else {
      current.push({ role, text: entry.text });
    }
    return current;
  }, []);
  if (turns[0]?.role === "user") {
    turns[0].text = `${fieldAndAnalysis}\n\n${turns[0].text}`;
  } else {
    turns.unshift({ role: "user", text: fieldAndAnalysis });
  }
  const currentQuestion = `Farmer's current question: ${message}${language ? `\nRequested response language: ${language}` : ""}`;
  if (turns[turns.length - 1]?.role === "user") {
    turns[turns.length - 1].text += `\n\n${currentQuestion}`;
  } else {
    turns.push({ role: "user", text: currentQuestion });
  }
  const currentTurnIndex = turns.length - 1;
  const contents = turns.map((turn, index) => ({
    role: turn.role,
    parts: [
      { text: turn.text },
      ...(index === currentTurnIndex && imageMatch
        ? [{ inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } }]
        : []),
    ],
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS }] },
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
        }),
      },
    );

    if (!response.ok) {
      console.warn("AgroMind chat model returned HTTP", response.status);
      return offlineResponse(
        message,
        field,
        "The live AI service is temporarily unavailable; general safe guidance is shown instead.",
        language,
      );
    }

    const reply = parseModelReply(await response.json());

    if (!reply) {
      console.warn("AgroMind chat model returned no text");
      return offlineResponse(
        message,
        field,
        "The live AI service did not return an answer; general safe guidance is shown instead.",
        language,
      );
    }

    return NextResponse.json({ reply, mode: "live" });
  } catch (error) {
    console.warn("AgroMind chat request failed", error);
    return offlineResponse(
      message,
      field,
      "The live AI service could not be reached; general safe guidance is shown instead.",
      language,
    );
  }
}
