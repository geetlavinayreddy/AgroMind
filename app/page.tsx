"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type View = "overview" | "disease" | "field" | "collaboration" | "evidence" | "assistant";
type AgentResult = { agent: string; status: "ok" | "fallback"; summary: string; confidence: number };
type RunResult = {
  plan: string[];
  warnings: string[];
  agents: AgentResult[];
  sources: { name: string; status: "authorized" | "illustrative"; url?: string }[];
};

const emptyResult: RunResult = {
  plan: ["Select a field scenario or upload a crop image to begin."],
  warnings: ["No action is executed automatically."],
  agents: [
    { agent: "Disease", status: "fallback", summary: "Waiting for input", confidence: 0 },
    { agent: "Irrigation", status: "fallback", summary: "Waiting for input", confidence: 0 },
    { agent: "Resources", status: "fallback", summary: "Waiting for input", confidence: 0 },
    { agent: "Market", status: "fallback", summary: "Waiting for input", confidence: 0 },
  ],
  sources: [{ name: "No source request has run", status: "illustrative" }],
};

export default function Home() {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState("Disease");
  const [result, setResult] = useState(emptyResult);
  const [imagePreview, setImagePreview] = useState("");
  const [imageData, setImageData] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "Ask about this field, a symptom, irrigation, soil or a mandi." },
  ]);
  const [form, setForm] = useState({
    crop: "Tomato",
    district: "Anantapur",
    soil: "Red sandy loam",
    moisture: "22",
    rain: "18",
    issue: "Yellow-brown spots on lower leaves",
  });

  useEffect(() => {
    if (!supabase) {
      setLoginError("Authentication is not configured.");
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSessionStarted(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSessionStarted(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  async function enterSession(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return setLoginError("Authentication is not configured.");
    if (!loginEmail.trim() || loginPassword.length < 8) {
      setLoginError("Enter a valid email and a password with at least 8 characters.");
      return;
    }
    setAuthBusy(true);
    setLoginError("");
    const response = authMode === "sign-up"
      ? await supabase.auth.signUp({ email: loginEmail.trim(), password: loginPassword, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    setAuthBusy(false);
    if (response.error) return setLoginError(response.error.message);
    if (authMode === "sign-up" && !response.data.session) {
      setLoginError("Account created. Confirm your email, then sign in.");
      setAuthMode("sign-in");
      return;
    }
    setSessionStarted(Boolean(response.data.session));
  }

  async function logout() {
    await supabase?.auth.signOut();
    setSessionStarted(false);
  }

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyScenario(type: "tomato" | "rice" | "maize") {
    const scenarios = {
      tomato: { crop: "Tomato", district: "Anantapur", soil: "Red sandy loam", moisture: "22", rain: "18", issue: "Yellow-brown spots on lower leaves" },
      rice: { crop: "Rice", district: "Thanjavur", soil: "Clay", moisture: "48", rain: "30", issue: "Leaf discoloration after heavy rain" },
      maize: { crop: "Maize", district: "Indore", soil: "Black cotton soil", moisture: "36", rain: "8", issue: "No visible disease symptoms" },
    };
    setForm(scenarios[type]);
  }

  function selectImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 8 * 1024 * 1024) {
      setLoginError("Image must be smaller than 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      setImageData(value);
      setImagePreview(value);
    };
    reader.readAsDataURL(file);
  }

  async function runAgents(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setView("collaboration");
    setActiveAgent("Disease");
    const sequence = ["Disease", "Irrigation", "Resources", "Market", "Orchestrator"];
    let index = 0;
    const timer = window.setInterval(() => {
      index = Math.min(index + 1, sequence.length - 1);
      setActiveAgent(sequence[index]);
    }, 450);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, image: imageData }),
      });
      if (!response.ok) throw new Error("Agent service unavailable");
      setResult(await response.json());
      setActiveAgent("Orchestrator");
    } catch {
      setResult({
        ...emptyResult,
        warnings: ["The agent service could not be reached. No simulated decision is shown."],
      });
    } finally {
      window.clearInterval(timer);
      setLoading(false);
    }
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    setChatInput("");
    setChatMessages((current) => [...current, { role: "user", text: message }]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, field: form }),
      });
      const data = await response.json();
      setChatMessages((current) => [...current, { role: "assistant", text: data.reply || "No verified response was available." }]);
    } catch {
      setChatMessages((current) => [...current, { role: "assistant", text: "The assistant could not connect." }]);
    }
  }

  if (!sessionStarted) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-brand"><span className="brandmark">AM</span><div><strong>AgroMind AI</strong><span>Agricultural Intelligence Portal</span></div></div>
          <div className="login-copy">
            <span className="eyebrow">Secure decision workspace</span>
            <h1>Evidence-based decisions, field by field.</h1>
            <p>Sign in to use the disease, irrigation, resource and market intelligence ecosystem.</p>
          </div>
          <form className="login-form" onSubmit={enterSession}>
            <h2>{authMode === "sign-up" ? "Create account" : "Welcome back"}</h2>
            <label>Email address<input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
            <label>Password<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
            {loginError && <p className="login-error">{loginError}</p>}
            <button className="primary login-submit" disabled={authBusy}>{authBusy ? "Please wait..." : authMode === "sign-up" ? "Create account" : "Sign in securely"}</button>
            <button type="button" className="auth-mode-button" onClick={() => setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up")}>
              {authMode === "sign-up" ? "Already registered? Sign in" : "New here? Create an account"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "disease", label: "Disease Scan", icon: "◉" },
    { id: "field", label: "Field Analysis", icon: "▦" },
    { id: "collaboration", label: "Agent Collaboration", icon: "◎" },
    { id: "evidence", label: "Agent Knowledge", icon: "✓" },
    { id: "assistant", label: "AI Assistant", icon: "✦" },
  ];

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand"><span className="brandmark">AM</span><strong>AgroMind</strong></div>
        <nav>
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <button className="logout-button" onClick={logout}>Sign out</button>
      </aside>

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div><span className="eyebrow">AgroMind workspace</span><h1>{navItems.find((item) => item.id === view)?.label}</h1></div>
          <button className="header-action" onClick={() => setView("field")}>New analysis</button>
        </header>

        <div className="view-stage" key={view}>
          {view === "overview" && (
            <div className="overview-grid">
              <article className="hero-card">
                <div className="hero-card-overlay">
                  <span>Field decision center</span>
                  <h2>One field. Five coordinated agents.</h2>
                  <p>Scan a crop, reconcile field conditions and receive one governed plan.</p>
                  <button className="primary" onClick={() => setView("disease")}>Scan a crop</button>
                </div>
              </article>
              <article className="metric-card weather-card">
                <span>Field weather</span><strong>28°C</strong>
                <div className="mini-bars" aria-label="Rain forecast">{[42,58,76,64,35].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
                <small>18 mm forecast · next 24 hours</small>
              </article>
              <article className="metric-card moisture-card">
                <span>Root-zone moisture</span><strong>22%</strong>
                <div className="moisture-ring"><i>Low</i></div>
                <small>Measurement: 22 cm depth</small>
              </article>
              <article className="action-card">
                <div className="action-card-head"><h3>Today’s field workflow</h3><b>4 steps</b></div>
                <div className="workflow-steps">
                  <button onClick={() => setView("disease")}><span>1</span><strong>Crop scan</strong><small>Image and symptoms</small></button>
                  <button onClick={() => setView("field")}><span>2</span><strong>Field context</strong><small>Soil and weather</small></button>
                  <button onClick={() => setView("collaboration")}><span>3</span><strong>Agent review</strong><small>Specialist handoffs</small></button>
                  <button onClick={() => runAgents()}><span>4</span><strong>Run plan</strong><small>Human approval</small></button>
                </div>
              </article>
              <article className="field-map-card">
                <div className="field-map-head"><div><span>Live parcel</span><strong>Anantapur · Plot 07</strong></div><b>12.4 acres</b></div>
                <div className="field-map" aria-label="Stylized field map">
                  <div className="field-row row-a" /><div className="field-row row-b" /><div className="field-row row-c" />
                  <span className="field-pin pin-a">A1</span><span className="field-pin pin-b">A2</span><span className="field-pin pin-c">A3</span>
                </div>
                <div className="field-map-legend"><span><i className="healthy" />Healthy</span><span><i className="watch" />Monitor</span><span><i className="dry" />Dry zone</span></div>
              </article>
            </div>
          )}

          {view === "disease" && (
            <div className="two-column">
              <article className="panel">
                <div className="panel-title"><span className="eyebrow">Vision agent</span><h2>Crop disease scan</h2></div>
                <label className="image-upload">{imagePreview ? <img src={imagePreview} alt="Crop leaf preview" /> : <><strong>Upload a crop leaf image</strong><small>JPG or PNG · close, clear symptoms preferred</small></>}<input type="file" accept="image/*" capture="environment" onChange={(event) => selectImage(event.target.files?.[0])} /></label>
                <div className="sample-strip">
                  <button type="button" onClick={() => update("issue", "Yellow-brown leaf spots with possible fungal spread")}>Tomato spotting</button>
                  <button type="button" onClick={() => update("issue", "Dark leaf lesions after prolonged humidity")}>Blight pattern</button>
                  <button type="button" onClick={() => update("issue", "No visible disease symptoms")}>Healthy leaf</button>
                </div>
                <label>Observed symptom<textarea value={form.issue} onChange={(event) => update("issue", event.target.value)} /></label>
                <button className="primary full" onClick={() => runAgents()} disabled={loading}>Run disease-to-orchestrator analysis</button>
              </article>
              <article className="panel">
                <div className="panel-title"><span className="eyebrow">Agent response</span><h2>Disease agent</h2></div>
                <div className={`agent-status ${loading ? "working" : ""}`}>{loading ? "Scanning and consulting evidence..." : result.agents[0]?.summary}</div>
                <div className="handoff"><strong>Cross-agent handoff</strong><p>Symptom confidence informs Irrigation risk, Resource checks and the Central Orchestrator.</p></div>
              </article>
            </div>
          )}

          {view === "field" && (
            <article className="panel field-panel">
              <div className="panel-title"><span className="eyebrow">Field inputs</span><h2>Configure the specialist context</h2></div>
              <div className="scenario-row"><button onClick={() => applyScenario("tomato")}>Tomato stress</button><button onClick={() => applyScenario("rice")}>Rice flood risk</button><button onClick={() => applyScenario("maize")}>Maize healthy</button></div>
              <div className="telemetry-grid">
                <div><span>Soil moisture</span><strong>{form.moisture}%</strong><small>Root zone</small></div>
                <div><span>Rain forecast</span><strong>{form.rain} mm</strong><small>Next 24 hours</small></div>
                <div><span>Field crop</span><strong>{form.crop}</strong><small>{form.district}</small></div>
              </div>
              <div className="form-grid">
                <label>Crop<select value={form.crop} onChange={(e) => update("crop", e.target.value)}><option>Tomato</option><option>Rice</option><option>Maize</option><option>Groundnut</option></select></label>
                <label>District<input value={form.district} onChange={(e) => update("district", e.target.value)} /></label>
                <label>Soil<input value={form.soil} onChange={(e) => update("soil", e.target.value)} /></label>
                <label>Moisture %<input type="number" value={form.moisture} onChange={(e) => update("moisture", e.target.value)} /></label>
                <label>Rainfall (mm)<input type="number" value={form.rain} onChange={(e) => update("rain", e.target.value)} /></label>
                <label>Observed issue<input value={form.issue} onChange={(e) => update("issue", e.target.value)} /></label>
              </div>
              <button className="primary full" onClick={() => runAgents()} disabled={loading}>{loading ? "Running all agents..." : "Run agent collaboration"}</button>
            </article>
          )}

          {view === "collaboration" && (
            <div>
              <div className="collaboration-flow">
                {["Disease", "Irrigation", "Resources", "Market", "Orchestrator"].map((name, index) => {
                  const agent = result.agents.find((item) => item.agent === name);
                  const working = loading && activeAgent === name;
                  return (
                    <div className="flow-node" key={name}>
                      <span className={`flow-dot ${working ? "working" : agent?.status === "ok" ? "connected" : ""}`}>{index + 1}</span>
                      <strong>{name}</strong>
                      <small>{working ? "Analyzing..." : agent?.summary}</small>
                    </div>
                  );
                })}
              </div>
              <div className="specialist-grid">
                {[
                  { name: "Disease", icon: "◉", input: "Crop image · symptoms", output: "Likely cause · confidence · escalation", handoff: "Irrigation · Resources · Orchestrator" },
                  { name: "Irrigation", icon: "≈", input: "Moisture · rainfall · crop stage", output: "Water timing · root-zone check", handoff: "Disease · Resources · Orchestrator" },
                  { name: "Resources", icon: "◇", input: "Soil type · district · soil test", output: "Nutrient workflow · cost signal", handoff: "Irrigation · Market · Orchestrator" },
                  { name: "Market", icon: "⌁", input: "Crop · district · production index", output: "Mandi evidence · harvest context", handoff: "Resources · Orchestrator" },
                ].map((agent) => {
                  const response = result.agents.find((item) => item.agent === agent.name);
                  const working = loading && activeAgent === agent.name;
                  return (
                    <article className={`specialist-card ${working ? "working" : ""}`} key={agent.name}>
                      <div className="specialist-head"><span>{agent.icon}</span><div><small>Independent specialist</small><h3>{agent.name}</h3></div><b className={response?.status === "ok" ? "connected" : ""}>{working ? "Running" : response?.status === "ok" ? "Responded" : "Fallback"}</b></div>
                      <div className="specialist-input"><strong>Receives</strong><span>{agent.input}</span></div>
                      <div className="specialist-output"><strong>Produces</strong><p>{working ? "Requesting verified evidence and preparing a response..." : response?.summary || "Waiting for analysis."}</p><small>{agent.output}</small></div>
                      <div className="handoff-line"><strong>Handoff</strong><span>{agent.handoff}</span></div>
                    </article>
                  );
                })}
              </div>
              <div className="orchestrator-card">
                <div><span>◎</span><div><small>Final reconciliation</small><h3>Central Orchestrator</h3></div></div>
                <article><div className="panel-title"><span className="eyebrow">Unified result</span><h2>Coordinated action plan</h2></div><ul className="plan-list">{result.plan.map((item) => <li key={item}>{item}</li>)}</ul>{result.warnings.map((item) => <p className="warning" key={item}>! {item}</p>)}</article>
              </div>
            </div>
          )}

          {view === "evidence" && (
            <article className="panel evidence-panel">
              <div className="panel-title"><span className="eyebrow">Agent knowledge</span><h2>Specialist training profiles</h2></div>
              {[
                ["Disease Agent", "Leaf-symptom triage, crop-specific visual cues, confidence limits and escalation rules."],
                ["Irrigation Agent", "Moisture thresholds, rainfall conflict checks, crop stage and root-zone planning."],
                ["Resources Agent", "Soil-type nutrient workflow, lab-first decisions and fertilizer safety boundaries."],
                ["Market Agent", "District crop context, harvest timing, price evidence and uncertainty disclosure."],
                ["Central Orchestrator", "Cross-agent reconciliation, contradiction detection and human-approval gates."],
              ].map(([name, description]) => (
                <div className="evidence-row" key={name}>
                  <div><strong>{name}</strong><small>{description}</small></div>
                  <b className="training-chip">Local profile</b>
                </div>
              ))}
            </article>
          )}

          {view === "assistant" && (
            <article className="panel chat-view">
              <div className="panel-title"><span className="eyebrow">Field copilot</span><h2>AgroMind AI Assistant</h2></div>
              <div className="chat-log">{chatMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}>{message.text}</div>)}</div>
              <form className="chat-form" onSubmit={sendChat}><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about the current field..." /><button>Send</button></form>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
