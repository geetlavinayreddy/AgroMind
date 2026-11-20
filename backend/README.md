# AgroMind Python Backend

The Python backend provides independent specialist-agent analysis through FastAPI.

## Run locally

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn agromind_api.main:app --app-dir backend --reload --port 8000
```

Open:

- API: http://127.0.0.1:8000
- Interactive API documentation: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health
- Ecosystem registry: http://127.0.0.1:8000/api/ecosystem

## Test

```powershell
python -m pytest backend/tests -q
python backend/training/evaluate_agents.py
```

## Evidence configuration

Configure secrets as environment variables; never commit them:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `DATA_GOV_IN_API_KEY`
- `AGMARKNET_RESOURCE_ID`
- `AGRICULTURAL_INDEX_URL`
- `SOIL_HEALTH_API_URL`
- `SOIL_HEALTH_API_KEY`
- `KRISHI_DSS_API_URL`
- `KRISHI_DSS_API_KEY`

The backend uses safe fallbacks when an authorized source or Gemini key is unavailable.
