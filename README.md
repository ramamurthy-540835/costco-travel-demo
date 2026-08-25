# Costco Travel Agentic Car Reservation

FastAPI and Cloud Run implementation with Application Default Credentials for Google Cloud access and `gemini-3.6-flash` on Vertex AI.

## Local

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID VERTEX_LOCATION=global AGENT_MODEL=gemini-3.6-flash
export ASSETS_BUCKET=$GOOGLE_CLOUD_PROJECT-costco-demo-assets
uvicorn app.main:app --port 8080
```

Startup idempotently seeds `CTR-D21OUT1` about 21 days ahead and `CTR-D30HRS1` about 30 hours ahead. Run `pytest -q` for policy and transition checks. Edit the first line of `deploy.sh`, then run `sh deploy.sh` to provision and deploy.

Only upload licensed/OEM-press/stock images beneath `gs://$PROJECT_ID-costco-demo-assets/cars/`. Missing objects return `image_url: null`.

## Safety

Original `CONFIRMED` becomes `HOLD` while a replacement is `PENDING`. Confirmation marks the replacement `CONFIRMED` before releasing the original to `CANCELLED`; abandonment deletes the replacement and restores the original. Cancellation always requires preview then confirm. HITL results never mutate state.

## Frontend gap

The named `costco-travel-agent-v3.html` is absent from the workspace. `static/` contains the existing local UI as a temporary same-origin fallback. Supply the v3 file before visual acceptance so only the three authorized wiring changes can be applied.
