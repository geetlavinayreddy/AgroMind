# AgroMind Agent and UI Audit

## Reference patterns reviewed

- AgriChat: fine-grained plant diagnosis, crop counting, structured visual understanding
- Agrova: strict Pydantic crop diagnosis, camera capture, weather, bilingual assistant
- TAM Intelligent Irrigation: explainable multi-agent irrigation, sensor history and alerts
- AgriLive: voice and vision assistant with structured farm advisories
- OSI OS: offline-first sensing and zone-based irrigation

## Remove

- Generic “waiting for input” language in completed agent cards
- External-source lists presented as trained agent knowledge
- Simulated values that could be mistaken for live measurements
- Automatic irrigation, treatment or market actions

## Add

- Dedicated specialist runs that execute only the selected agent
- Structured disease diagnosis fields for crop, disease, confidence, severity and follow-up
- Dedicated `/api/analyze-crop`, `/api/weather/{district}` and `/api/ask-agronomist` backend APIs
- Independent crop image, field and chatbot inputs
- Voice-ready and bilingual-ready assistant interfaces
- Per-agent confidence and cross-agent handoff information
- Offline-safe and human-approval fallbacks

## Layout direction

- One premium landing page with a floating authentication area
- Six focused dashboard pages instead of a dense information page
- Four separate specialist cards plus the central orchestrator
- Evidence and agent knowledge separated from live source availability
- Mobile-first sidebar, compact controls and touch-capable image upload

## Keep

- Next.js UI and Supabase authentication
- FastAPI specialist backend
- Central orchestrator conflict reconciliation
- Open-Meteo public weather context
- Human review for consequential decisions
