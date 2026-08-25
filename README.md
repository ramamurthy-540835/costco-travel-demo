# Costco Travel Agentic Car Reservation

FastAPI and Cloud Run implementation with Application Default Credentials for Google Cloud access and `gemini-3-flash-preview` on Vertex AI.

## Local

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID VERTEX_LOCATION=global AGENT_MODEL=gemini-3-flash-preview
export ASSETS_BUCKET=$GOOGLE_CLOUD_PROJECT-costco-demo-assets
uvicorn app.main:app --port 8080
```

Startup idempotently seeds `CTR-D21OUT1` about 21 days ahead and `CTR-D30HRS1` about 30 hours ahead. Run `pytest -q` for policy and transition checks. Edit the first line of `deploy.sh`, then run `sh deploy.sh` to provision and deploy.

Only upload licensed/OEM-press/stock images beneath `gs://$PROJECT_ID-costco-demo-assets/cars/`. Missing objects return `image_url: null`.

## Safety

Original `CONFIRMED` becomes `HOLD` while a replacement is `PENDING`. Confirmation marks the replacement `CONFIRMED` before releasing the original to `CANCELLED`; abandonment deletes the replacement and restores the original. Cancellation always requires preview then confirm. HITL results never mutate state.

## Live inventory

`GET /api/cars` validates pickup/return dates before accessing Secret Manager version 2 and SerpAPI. Results are cached for 15 minutes. Any secret, timeout, quota, or upstream error returns normalized sample inventory with `source: fallback`; every card still includes retail price, member rate, and savings. Vehicle images remain private GCS assets signed through ADC and never come from vendor websites.

## Frontend v3

The service serves `static/costco-travel-agent-v3.html`, generated from the maintainable frontend sources by:

```bash
python scripts/build_single_file.py
```
