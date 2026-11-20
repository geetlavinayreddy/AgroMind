"use client";

import { FormEvent, useState } from "react";

type AgentResult = {
  agent: string;
  status: "ok" | "fallback";
  summary: string;
  confidence: number;
};

type RunResult = {
  plan: string[];
  warnings: string[];
  agents: AgentResult[];
  sources: { name: string; status: "authorized" | "illustrative" }[];
  evidence?: {
    market?: {
      recordCount: number;
      averageModal: number | null;
      latestDate: string | null;
      sourceUrl: string;
    } | null;
    productionIndex?: {
      name: string;
      group: string;
      productionIndex: number;
      productivityIndex: number;
      sourceUrl: string;
    } | null;
  };
};

const initialResult: RunResult = {
  plan: [
    "Run a verified soil test before changing fertilizer",
    "Delay irrigation when the forecast predicts heavy rain",
    "Review crop symptoms again after 48 hours",
  ],
  warnings: ["Do not apply consequential treatment without local agronomist approval."],
  agents: [
    { agent: "Disease", status: "fallback", summary: "Image and history required", confidence: 0 },
    { agent: "Irrigation", status: "fallback", summary: "Weather context required", confidence: 0 },
    { agent: "Resources", status: "fallback", summary: "Soil test required", confidence: 0 },
    { agent: "Market", status: "fallback", summary: "Crop and district required", confidence: 0 },
  ],
  sources: [
    { name: "Authorized-source gateway", status: "illustrative" },
  ],
};

export default function Home() {
  const [form, setForm] = useState({
    crop: "Tomato",
    district: "Anantapur",
    soil: "Red sandy loam",
    moisture: "22",
    rain: "18",
    issue: "Yellow-brown spots on lower leaves",
  });
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(false);

  async function runAgents(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error("Agent service unavailable");
      setResult(await response.json());
    } catch {
      setResult({
        ...initialResult,
        warnings: ["The agent service could not be reached. This is an illustrative result, not field advice."],
      });
    } finally {
      setLoading(false);
    }
  }

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="shell">
      <nav className="nav" aria-label="Main navigation">
        <div className="brand"><span className="brandmark">AM</span> AgroMind</div>
        <div className="navlinks">
          <a href="#platform">Platform</a>
          <a href="#agents">Agents</a>
          <a href="#plan">Action plan</a>
        </div>
        <button className="demo-pill">Authorized data mode</button>
      </nav>

      <section className="hero" id="platform">
        <div>
          <span className="eyebrow">Agentic agricultural intelligence</span>
          <h1>Smarter decisions, <span>field by field.</span></h1>
          <p className="lead">
            One governed workspace where specialized agents reconcile crop health,
            irrigation, soil resources, market timing, and official public datasets.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => document.querySelector("#agents")?.scrollIntoView()}>
              Analyze a field
            </button>
            <button className="secondary" onClick={() => document.querySelector("#plan")?.scrollIntoView()}>
              View output
            </button>
          </div>
        </div>

        <div className="control-card" id="agents">
          <form className="card" onSubmit={runAgents}>
            <h2>Field decision workspace</h2>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="crop">Crop</label>
                <select id="crop" value={form.crop} onChange={(e) => update("crop", e.target.value)}>
                  <option>Tomato</option><option>Rice</option><option>Maize</option><option>Groundnut</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="district">District</label>
                <input id="district" value={form.district} onChange={(e) => update("district", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="soil">Soil</label>
                <input id="soil" value={form.soil} onChange={(e) => update("soil", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="moisture">Moisture %</label>
                <input id="moisture" type="number" value={form.moisture} onChange={(e) => update("moisture", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rain">Rainfall forecast (mm)</label>
                <input id="rain" type="number" value={form.rain} onChange={(e) => update("rain", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="issue">Observed issue</label>
                <input id="issue" value={form.issue} onChange={(e) => update("issue", e.target.value)} />
              </div>
            </div>
            <button className="primary run" disabled={loading}>{loading ? "Running specialist agents..." : "Generate governed plan"}</button>
          </form>
        </div>
      </section>

      <section className="workspace" id="plan">
        <div className="workspace-inner">
          <div className="section-head">
            <div><span className="eyebrow">Live reasoning view</span><h2>Agent collaboration</h2></div>
            <span className="notice">Human approval required for consequential actions</span>
          </div>

          <div className="agent-grid">
            {["Disease", "Irrigation", "Resources", "Market", "Orchestrator"].map((name, index) => {
              const found = result.agents.find((item) => item.agent === name);
              return (
                <article className="agent" key={name}>
                  <span className={`dot ${found?.status === "ok" ? "live" : ""}`} />
                  <strong>{name}</strong>
                  <p>{index === 4 ? "Reconciles recommendations" : found?.summary || "Specialist analysis"}</p>
                </article>
              );
            })}
          </div>

          <div className="results">
            <article className="plan">
              <h3>Unified action plan</h3>
              <ul>{result.plan.map((item) => <li key={item}>{item}</li>)}</ul>
              {result.warnings.map((item) => <p key={item}>! {item}</p>)}
            </article>
            <aside className="sources">
              <h3>Evidence & data sources</h3>
              {result.sources.map((source) => (
                <div className="source" key={source.name}>
                  <strong>{source.name}</strong><br />
                  <small>{source.status === "authorized" ? "Authorized source" : "Illustrative or unavailable"}</small>
                </div>
              ))}
              {result.evidence?.market && (
                <div className="source">
                  <strong>Variety-wise mandi evidence</strong><br />
                  <small>
                    {result.evidence.market.recordCount} records
                    {result.evidence.market.averageModal !== null
                      ? ` · average modal price ₹${result.evidence.market.averageModal.toFixed(0)}`
                      : ""}
                    {result.evidence.market.latestDate ? ` · ${result.evidence.market.latestDate}` : ""}
                  </small>
                </div>
              )}
              {result.evidence?.productionIndex && (
                <div className="source">
                  <strong>National production index</strong><br />
                  <small>
                    {result.evidence.productionIndex.group}: production{" "}
                    {result.evidence.productionIndex.productionIndex}, productivity{" "}
                    {result.evidence.productionIndex.productivityIndex}
                  </small>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
      <footer className="footer">AgroMind · decisions require local expert verification · no black-box field actions</footer>
    </main>
  );
}
