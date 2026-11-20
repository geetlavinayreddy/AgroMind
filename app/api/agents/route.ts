import { NextResponse } from "next/server";

export const runtime = "nodejs";

type FieldInput = {
  crop: string;
  district: string;
  soil: string;
  moisture: string;
  rain: string;
  issue: string;
};

type AgentResult = {
  agent: string;
  status: "ok" | "fallback";
  summary: string;
  confidence: number;
};

async function gemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || null;
}

async function getWeather(district: string) {
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(district)}&count=1&countryCode=IN`,
      { cache: "no-store" },
    );
    if (!geo.ok) return null;
    const geoData = await geo.json();
    const place = geoData.results?.[0];
    if (!place) return null;
    const weather = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=precipitation_probability_max&forecast_days=3&timezone=auto`,
      { cache: "no-store" },
    );
    if (!weather.ok) return null;
    const weatherData = await weather.json();
    return {
      name: "Open-Meteo weather forecast",
      probability: weatherData.daily?.precipitation_probability_max?.[0],
    };
  } catch {
    return null;
  }
}

async function getAuthorizedMarket(crop: string, district: string) {
  const key = process.env.DATA_GOV_IN_API_KEY;
  const resource =
    process.env.AGMARKNET_RESOURCE_ID ||
    "9ef84268-d588-465a-a308-a864a43d0070";
  if (!key) return null;
  try {
    const url =
      `https://api.data.gov.in/resource/${resource}?api-key=${encodeURIComponent(key)}&format=json` +
      `&filters[commodity]=${encodeURIComponent(crop)}&filters[district]=${encodeURIComponent(district)}&limit=10`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    const records = data.records || [];
    const modalPrices = records
      .map((record: Record<string, unknown>) =>
        Number(record.modal_price ?? record.modalprice ?? record["Modal Price"]),
      )
      .filter((value: number) => Number.isFinite(value));
    const averageModal =
      modalPrices.length > 0
        ? modalPrices.reduce((sum: number, value: number) => sum + value, 0) / modalPrices.length
        : null;
    return {
      name: "data.gov.in - Current Daily Price of Various Commodities",
      recordCount: records.length,
      averageModal,
      latestDate:
        records[0]?.arrival_date ?? records[0]?.date ?? records[0]?.["Arrival Date"] ?? null,
      sourceUrl: `https://www.data.gov.in/resource/${resource}`,
    };
  } catch {
    return null;
  }
}

async function getProductionIndex(crop: string) {
  const url =
    process.env.AGRICULTURAL_INDEX_URL ||
    "https://www.data.gov.in/files/ogdpv2dms/s3fs-public/datafile/index_numbers_of_agricultural_production_and_productivity_2006-07_2009.csv";
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const text = await response.text();
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")))
      .filter((row) => row.length >= 3);
    const cropKey = crop.toLowerCase();
    const row =
      rows.find((item) => item[1].toLowerCase().includes(cropKey)) ||
      rows.find((item) => item[1].toLowerCase().includes("all crops"));
    if (!row) return null;
    return {
      name: "Index Numbers of Agricultural Production and Productivity",
      group: row[1],
      productionIndex: Number(row[2]),
      productivityIndex: Number(row[3]),
      sourceUrl: "https://www.data.gov.in/files/ogdpv2dms/s3fs-public/datafile/index_numbers_of_agricultural_production_and_productivity_2006-07_2009.csv",
    };
  } catch {
    return null;
  }
}

function fallbackAgent(agent: string, input: FieldInput, detail: string): AgentResult {
  return { agent, status: "fallback", summary: detail, confidence: 55 };
}

export async function POST(request: Request) {
  let input: FieldInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const weather = await getWeather(input.district);
  const market = await getAuthorizedMarket(input.crop, input.district);
  const productionIndex = await getProductionIndex(input.crop);

  const specialists = [
    {
      agent: "Disease",
      prompt: `You are a crop-disease triage specialist. Given crop=${input.crop}, observed_issue=${input.issue}, district=${input.district}, respond in <=45 words. State likely causes, 2 checks, and when to escalate. Do not prescribe a pesticide dose; label uncertainty.`,
      fallback: "Visible symptoms need leaf examination",
    },
    {
      agent: "Irrigation",
      prompt: `You are an irrigation specialist. Field: crop=${input.crop}, soil=${input.soil}, moisture=${input.moisture}%, forecast_rain=${input.rain}mm, weather_probability=${weather?.probability ?? "unknown"}. Respond in <=45 words. Give one safe scheduling action and one soil check. No infrastructure operation without approval.`,
      fallback: "Forecast and soil moisture are under review",
    },
    {
      agent: "Resources",
      prompt: `You are a soil-nutrient specialist. Given crop=${input.crop}, soil=${input.soil}, district=${input.district}, respond in <=45 words. Recommend only a verified soil-test workflow and general nutrient categories. Never invent NPK doses.`,
      fallback: "A soil test is required before nutrient dosing",
    },
    {
      agent: "Market",
      prompt: `You are a market-timing specialist. Given crop=${input.crop}, district=${input.district}, authorized_mandi_record_count=${market?.recordCount ?? "unavailable"}, average_mandi_modal_price=${market?.averageModal ?? "unavailable"}, production_index=${productionIndex?.productionIndex ?? "unavailable"}, productivity_index=${productionIndex?.productivityIndex ?? "unavailable"}, respond in <=45 words. Explain the evidence before harvest or sale timing; do not invent prices or guarantees.`,
      fallback: market
        ? `${market.recordCount} authorized mandi records found; averages need review`
        : "District mandi evidence is unavailable",
    },
  ];

  const agents: AgentResult[] = [];
  for (const specialist of specialists) {
    const text = await gemini(specialist.prompt);
    agents.push(
      text
        ? { agent: specialist.agent, status: "ok", summary: text, confidence: 72 }
        : fallbackAgent(specialist.agent, input, specialist.fallback),
    );
  }

  const orchestratorPrompt =
    `You are the central agricultural orchestrator. Reconcile these specialist outputs and produce 3 concise actions and 1 warning: ` +
    agents.map((agent) => `${agent.agent}: ${agent.summary}`).join("; ") +
    `. Return plain text only. Require local agronomist, soil lab, and farmer approval where consequential.`;
  const orchestratorText = await gemini(orchestratorPrompt);
  const plan = orchestratorText
    ? orchestratorText.split(/\n|(?<=\.)\s+/).map((line: string) => line.replace(/^[-*\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 4)
    : [
        "Use the latest verified soil test before nutrient decisions",
        "Avoid irrigation before checking the forecast and root-zone moisture",
        "Photograph symptoms and consult a local crop protection specialist",
      ];

  const sources: { name: string; status: "authorized" | "illustrative" }[] = [
    weather ? { name: weather.name, status: "authorized" } : { name: "District weather", status: "illustrative" },
    market ? { name: market.name, status: "authorized" } : { name: "Agmarknet variety-wise daily prices", status: "illustrative" },
    productionIndex
      ? { name: productionIndex.name, status: "authorized" }
      : { name: "Agricultural production and productivity index", status: "illustrative" },
  ];

  return NextResponse.json({
    plan,
    warnings: [
      "No treatment, irrigation release, or fertilizer dose is applied automatically.",
      "Local agronomic verification is required before consequential action.",
    ],
    agents,
    sources,
    evidence: {
      market: market
        ? {
            recordCount: market.recordCount,
            averageModal: market.averageModal,
            latestDate: market.latestDate,
            sourceUrl: market.sourceUrl,
          }
        : null,
      productionIndex,
    },
  });
}
