"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

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
  sources: { name: string; status: "authorized" | "illustrative"; url?: string }[];
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
  plan: ["Complete the field form and run a collaboration analysis."],
  warnings: ["The initial screen does not contain simulated decisions."],
  agents: [
    { agent: "Disease", status: "fallback", summary: "Waiting for field inputs", confidence: 0 },
    { agent: "Irrigation", status: "fallback", summary: "Waiting for field inputs", confidence: 0 },
    { agent: "Resources", status: "fallback", summary: "Waiting for field inputs", confidence: 0 },
    { agent: "Market", status: "fallback", summary: "Waiting for field inputs", confidence: 0 },
  ],
  sources: [
    { name: "No source request has run", status: "illustrative" },
  ],
};

export default function Home() {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [ecosystem, setEcosystem] = useState<{
    orchestrator: { name: string; humanApprovalRequired: boolean };
    agents: { name: string; domain: string; status: string; authorizedSources: string[] }[];
  } | null>(null);
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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "Hello. I can help with crop symptoms, soil checks, irrigation planning and mandi questions." },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState("Disease");

  useEffect(() => {
    if (!supabase) {
      setSessionStarted(false);
      setLoginError("Authentication is not configured.");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSessionStarted(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionStarted(Boolean(session));
    });

    fetch("/api/ecosystem")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data ? setEcosystem(data) : null)
      .catch(() => setEcosystem(null));

    return () => data.subscription.unsubscribe();
  }, []);

  async function enterSession(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setLoginError("Authentication is not configured.");
      return;
    }
    if (!loginEmail.trim() || loginPassword.length < 8) {
      setLoginError("Enter a valid email and a password with at least 8 characters.");
      return;
    }

    setAuthBusy(true);
    setLoginError("");
    const result =
      authMode === "sign-up"
        ? await supabase.auth.signUp({
            email: loginEmail.trim(),
            password: loginPassword,
            options: { emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.signInWithPassword({
            email: loginEmail.trim(),
            password: loginPassword,
          });
    setAuthBusy(false);

    if (result.error) {
      setLoginError(result.error.message);
      return;
    }
    if (authMode === "sign-up" && !result.data.session) {
      setLoginError("Account created. Check your email to confirm it, then sign in.");
      setAuthMode("sign-in");
      return;
    }
    setSessionStarted(Boolean(result.data.session));
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Enter an email address and password.");
      return;
    }
  }

  async function endSession() {
    await supabase?.auth.signOut();
    setSessionStarted(false);
  }

  async function runAgents(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setActiveAgent("Disease");
    const agentSequence = ["Disease", "Irrigation", "Resources", "Market", "Orchestrator"];
    let sequenceIndex = 0;
    const progressTimer = window.setInterval(() => {
      sequenceIndex = Math.min(sequenceIndex + 1, agentSequence.length - 1);
      setActiveAgent(agentSequence[sequenceIndex]);
    }, 350);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error("Agent service unavailable");
      setResult(await response.json());
      setActiveAgent("Orchestrator");
    } catch {
      setResult({
        ...initialResult,
        warnings: ["The agent service could not be reached. This is an illustrative result, not field advice."],
      });
    } finally {
      window.clearInterval(progressTimer);
      setLoading(false);
    }
  }

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyScenario(scenario: "tomato" | "rice" | "maize") {
    const presets = {
      tomato: {
        crop: "Tomato",
        district: "Anantapur",
        soil: "Red sandy loam",
        moisture: "22",
        rain: "18",
        issue: "Yellow-brown spots on lower leaves",
      },
      rice: {
        crop: "Rice",
        district: "Thanjavur",
        soil: "Clay",
        moisture: "48",
        rain: "30",
        issue: "Unusual leaf discoloration after rain",
      },
      maize: {
        crop: "Maize",
        district: "Indore",
        soil: "Black cotton soil",
        moisture: "36",
        rain: "8",
        issue: "No visible disease symptoms",
      },
    };
    setForm(presets[scenario]);
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    setChatMessages((current) => [...current, { role: "user", text }]);
    setChatLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, field: form }),
      });
      const data = await response.json();
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: response.ok
            ? data.reply
            : "The assistant is unavailable. Please use the field analysis tool.",
        },
      ]);
    } catch {
      setChatMessages((current) => [
        ...current,
        { role: "assistant", text: "The assistant could not connect. Please verify the field inputs and try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  if (!sessionStarted) {
    return (
      <main className="login-shell">
        <section className="login-panel" aria-label="AgroMind login">
          <div className="login-brand">
            <span className="brandmark">AM</span>
            <div>
              <strong>AgroMind AI</strong>
              <span>Agricultural Intelligence Portal</span>
            </div>
          </div>
          <div className="login-copy">
            <span className="eyebrow">Secure decision workspace</span>
            <h1>Sign in to analyze and manage your fields.</h1>
            <p>Combine verified agricultural evidence with specialist agents and human approval.</p>
          </div>
          <form className="login-form" onSubmit={enterSession}>
            <h2>{authMode === "sign-up" ? "Create your account" : "Welcome back"}</h2>
            <div className="field">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>
            {loginError && <p className="login-error">{loginError}</p>}
            <button className="primary login-submit" type="submit" disabled={authBusy}>
              {authBusy
                ? "Please wait..."
                : authMode === "sign-up"
                  ? "Create account"
                  : "Sign in securely"}
            </button>
            <button
              className="auth-mode-button"
              type="button"
              onClick={() => {
                setLoginError("");
                setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up");
              }}
            >
              {authMode === "sign-up"
                ? "Already registered? Sign in"
                : "New here? Create an account"}
            </button>
          </form>
        </section>
        <aside className="login-proof">
          <span>Multi-agent evidence ecosystem</span>
          <ul>
            <li><strong>Disease</strong> crop-health evidence</li>
            <li><strong>Irrigation</strong> weather and moisture evidence</li>
            <li><strong>Resources</strong> soil and nutrient evidence</li>
            <li><strong>Market</strong> mandi and production evidence</li>
            <li><strong>Orchestrator</strong> unified conflict-managed plan</li>
          </ul>
        </aside>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="govbar">
        <div>
          <span className="gov-emblem" aria-hidden="true">AM</span>
          <span>AgroMind Agricultural Decision Support | Prototype</span>
        </div>
        <div className="govtools">
          <span>Screen Reader Access</span>
          <span>A+</span>
          <span>A</span>
          <span>A-</span>
          <span>English / हिन्दी</span>
        </div>
      </div>
      <nav className="nav" aria-label="Main navigation">
        <div className="brand"><span className="brandmark">AM</span> AgroMind</div>
        <div className="navlinks">
          <a href="#platform">Home</a>
          <a href="#features">Features</a>
          <a href="#agents">AI Agents</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#plan">Collaboration Demo</a>
          <a href="#food-security">Food Security</a>
          <a href="#about">About</a>
        </div>
        <button className="demo-pill" type="button" onClick={endSession}>Log out</button>
      </nav>

      <section className="hero" id="platform">
        <div>
          <span className="eyebrow">National Agricultural Decision Support</span>
          <h1>Evidence-based decisions, <span>field by field.</span></h1>
          <p className="lead">
            AgroMind provides a governed decision workspace that brings together
            crop health, irrigation, soil resources, mandi prices and official public datasets.
            Recommendations require field verification and expert approval.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => document.querySelector("#field-workspace")?.scrollIntoView()}>
              Analyze a field
            </button>
            <button className="secondary" onClick={() => document.querySelector("#plan")?.scrollIntoView()}>
              View output
            </button>
          </div>
        </div>

        <div className="control-card" id="field-workspace">
          <form className="card" onSubmit={runAgents}>
            <h2>Field decision workspace</h2>
            <div className="scenario-row" aria-label="Field scenario presets">
              <button type="button" onClick={() => applyScenario("tomato")}>Tomato stress</button>
              <button type="button" onClick={() => applyScenario("rice")}>Rice flood risk</button>
              <button type="button" onClick={() => applyScenario("maize")}>Maize healthy</button>
            </div>
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

      <section className="public-services" id="features">
        <div className="public-services-inner">
          <div className="public-heading">
            <span className="eyebrow">Agricultural services</span>
            <h2>Integrated decision support for every stage</h2>
          </div>
          <div className="service-grid">
            <article>
              <span className="service-number">01</span>
              <h3>Crop Health</h3>
              <p>Symptom triage, disease evidence and expert escalation.</p>
            </article>
            <article>
              <span className="service-number">02</span>
              <h3>Water Planning</h3>
              <p>Soil moisture and weather-aligned irrigation guidance.</p>
            </article>
            <article>
              <span className="service-number">03</span>
              <h3>Soil Resources</h3>
              <p>Lab-first nutrient planning and resource efficiency.</p>
            </article>
            <article>
              <span className="service-number">04</span>
              <h3>Market Information</h3>
              <p>Variety-wise mandi prices and national production context.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="information-section" id="how-it-works">
        <div className="information-inner">
          <div className="public-heading">
            <span className="eyebrow">How it works</span>
            <h2>From field evidence to reviewed action</h2>
          </div>
          <div className="workflow-grid">
            <article><span>1</span><h3>Submit field information</h3><p>Enter crop, district, soil, moisture and observed symptoms.</p></article>
            <article><span>2</span><h3>Independent specialist analysis</h3><p>Four agents analyze their designated evidence domain separately.</p></article>
            <article><span>3</span><h3>Central reconciliation</h3><p>The orchestrator identifies conflicts and prepares a unified plan.</p></article>
            <article><span>4</span><h3>Human approval</h3><p>Farmers and qualified experts review all consequential recommendations.</p></article>
          </div>
        </div>
      </section>

      <section className="agents-section" id="agents">
        <div className="agents-inner">
          <div className="public-heading">
            <span className="eyebrow">Specialist services</span>
            <h2>Independent intelligence agents</h2>
          </div>
          {ecosystem && (
            <div className="ecosystem-status" aria-label="Agent ecosystem status">
              <strong>{ecosystem.orchestrator.name}</strong>
              <span>Central reconciliation</span>
              {ecosystem.agents.map((agent) => (
                <span key={agent.name}>
                  {agent.name}: {agent.status}
                </span>
              ))}
            </div>
          )}
          <div className="agent-card-grid">
            <article>
              <span className="agent-code">01</span>
              <h3>Disease Detection</h3>
              <p>Crop symptom triage with district disease evidence and expert escalation.</p>
              <small>Primary evidence: Krishi DSS</small>
            </article>
            <article>
              <span className="agent-code">02</span>
              <h3>Smart Irrigation</h3>
              <p>Weather-aware and soil-moisture-aware water scheduling guidance.</p>
              <small>Primary evidence: Open-Meteo / IMD-ready gateway</small>
            </article>
            <article>
              <span className="agent-code">03</span>
              <h3>Resource Optimization</h3>
              <p>Soil-lab-first nutrient planning without invented fertilizer doses.</p>
              <small>Primary evidence: Soil Health Card</small>
            </article>
            <article>
              <span className="agent-code">04</span>
              <h3>Market Intelligence</h3>
              <p>Variety-wise mandi prices, harvest timing context and national indices.</p>
              <small>Primary evidence: data.gov.in / AGMARKNET</small>
            </article>
          </div>
        </div>
      </section>

      <section className="platform-section" id="platform-suite">
        <div className="information-inner">
          <div className="public-heading">
            <span className="eyebrow">Comprehensive platform suite</span>
            <h2>Everything farmers need in one connected workspace</h2>
          </div>
          <div className="platform-grid">
            {[
              ["AI Crop Disease Detection", "Foliar symptom review, confidence guidance and expert escalation."],
              ["Smart Irrigation Planning", "Weather- and soil-moisture-aware scheduling without automatic pump action."],
              ["Soil & Nutrient Intelligence", "Lab-first nutrient planning and responsible resource guidance."],
              ["Crop & Yield Planning", "Suitability, harvest timing and production-context analysis."],
              ["Market Price Intelligence", "Variety-wise mandi prices and regional market evidence."],
              ["AI Farm Assistant", "Conversational access to field-specific agricultural guidance."],
              ["Farm Monitoring", "A single evidence dashboard for field, weather and specialist outputs."],
              ["Food Security Insights", "Aggregated indicators for cooperatives and regional planning."],
            ].map(([title, description]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
                <button type="button" onClick={() => document.querySelector("#agents")?.scrollIntoView()}>
                  Explore capability
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="food-section" id="food-security">
        <div className="information-inner">
          <div className="public-heading">
            <span className="eyebrow">Community and macro intelligence</span>
            <h2>Building a more resilient agricultural future</h2>
          </div>
          <div className="food-grid">
            <article>
              <h3>Regional production context</h3>
              <p>Compare crop availability, production indices and aggregate surplus signals.</p>
            </article>
            <article>
              <h3>Deficit early warnings</h3>
              <p>Review potential shortages and seasonal supply pressure with local validation.</p>
            </article>
            <article>
              <h3>Buffer and reserve planning</h3>
              <p>Identify where further institutional and cooperative evidence is needed.</p>
            </article>
            <article>
              <h3>Farmer privacy</h3>
              <p>Community indicators should use anonymized records; personal parcel data stays private.</p>
            </article>
          </div>
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
              const processing = loading && activeAgent === name;
              return (
                <article className="agent" key={name}>
                  <span className={`dot ${found?.status === "ok" ? "live" : processing ? "live" : ""}`} />
                  <strong>{name}</strong>
                  <p>
                    {processing
                      ? "Analyzing field evidence..."
                      : index === 4
                        ? "Reconciles recommendations"
                        : found?.summary || "Specialist analysis"}
                  </p>
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
            <aside className="sources" id="sources">
              <h3>Evidence & data sources</h3>
              {result.sources.map((source) => (
                <div className="source" key={source.name}>
                  <strong>{source.name}</strong><br />
                  <small>{source.status === "authorized" ? "Authorized source" : "Illustrative or unavailable"}</small>
                  {source.url && (
                    <>
                      {" "}
                      <a href={source.url} target="_blank" rel="noreferrer">Open source</a>
                    </>
                  )}
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
      {chatOpen && (
        <aside className="chat-panel" aria-label="AgroMind AI Farm Assistant">
          <header>
            <div>
              <strong>AI Farm Assistant</strong>
              <small>Evidence-aware · expert review required</small>
            </div>
            <button type="button" onClick={() => setChatOpen(false)} aria-label="Close chat">×</button>
          </header>
          <div className="chat-messages">
            {chatMessages.map((message, index) => (
              <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                {message.text}
              </div>
            ))}
            {chatLoading && <div className="chat-message assistant">Preparing a verified response…</div>}
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about crops, soil or irrigation"
              aria-label="Farm assistant message"
            />
            <button type="submit" disabled={chatLoading}>Send</button>
          </form>
        </aside>
      )}
      {!chatOpen && (
        <button className="chat-launcher" type="button" onClick={() => setChatOpen(true)}>
          <span>Ask</span>
          <strong>AI Farm Assistant</strong>
        </button>
      )}
      <section className="legal-section" id="about">
        <div className="information-inner">
          <div className="public-heading">
            <span className="eyebrow">About AgroMind AI</span>
            <h2>Independent agricultural decision support</h2>
          </div>
          <p className="about-copy">
            AgroMind AI unites crop disease triage, smart irrigation, soil resource optimization,
            mandi market intelligence and a central reconciliating agent. The platform is an
            independent prototype and is not an official government service.
          </p>
        </div>
      </section>

      <section className="legal-section policy-section" id="privacy">
        <div className="information-inner policy-grid">
          <article>
            <h2>Privacy Policy</h2>
            <p>Field inputs are used only to process the requested analysis. Avoid entering personal identifiers or sensitive financial information. Any future account or persistent-history feature should collect and disclose data only with explicit consent.</p>
          </article>
          <article id="terms">
            <h2>Terms &amp; Conditions</h2>
            <p>AgroMind provides decision-support information, not certified agronomic, medical, legal or financial advice. No recommendation is automatically executed. Users and qualified local professionals remain responsible for field decisions and applicable local regulations.</p>
          </article>
          <article id="security">
            <h2>Security Disclosures</h2>
            <p>API credentials must remain in server-side environment variables and must never be exposed in browser code or source control. Source and model responses should be reviewed before consequential use.</p>
          </article>
        </div>
      </section>

      <footer className="site-footer" id="support">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="brand"><span className="brandmark">AM</span> AgroMind AI</div>
            <p>From smart farming to smarter decisions. An integrated multi-agent agricultural intelligence platform.</p>
            <small>Version 2.4.0 · Enterprise prototype</small>
          </div>
          <div>
            <h3>Navigation</h3>
            <a href="#platform">Home</a>
            <a href="#features">Platform Features</a>
            <a href="#agents">AI Agents</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#plan">Collaboration Demo</a>
            <a href="#food-security">Food Security</a>
          </div>
          <div>
            <h3>Platform Features</h3>
            <span>Disease Detection</span>
            <span>Smart Irrigation</span>
            <span>Soil &amp; Nutrient Intelligence</span>
            <span>Market Intelligence</span>
            <span>Central Orchestrator</span>
          </div>
          <div>
            <h3>Connect &amp; Support</h3>
            <a href="mailto:?subject=AgroMind%20AI%20support">Contact Team</a>
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms &amp; Conditions</a>
            <a href="#security">Security Disclosures</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 AgroMind AI. All rights reserved.</span>
          <span>
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#security">Security Disclosures</a>
          </span>
        </div>
      </footer>
    </main>
  );
}
