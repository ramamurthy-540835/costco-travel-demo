# Costco Travel Rental Car AI Concierge

An end-to-end AI-powered rental car booking platform built on **Google Cloud**, featuring a Gemini AI concierge, real-time vendor integration across 4 rental companies, a Neo4j-style knowledge graph, and BigQuery analytics.

**Live demo:** [costco-travel-demo-1035117862188.us-central1.run.app](https://costco-travel-demo-1035117862188.us-central1.run.app)

## Architecture

```
Customer ─→ Gemini AI Concierge ─→ Costco Travel Platform ─→ Vendor Systems
                                         │
                    ┌────────────────────┤────────────────────┐
                    ▼                    ▼                    ▼
              Firestore DB         BigQuery            GCS Assets
              (9 collections)    (analytics)          (car images)
                    │
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
     Alamo        Avis       Budget    Enterprise
   (dashboard)  (dashboard) (dashboard) (dashboard)
```

| Component | Technology |
|---|---|
| AI Concierge | Gemini 3 Flash Preview (Vertex AI) |
| Backend | FastAPI (Python 3.12) |
| Database | Cloud Firestore (Native mode) |
| Analytics | BigQuery (`costco_travel_ai` dataset) |
| Graph Visualization | vis.js Network (Neo4j-style) |
| Car Images | Cloud Storage (public bucket) |
| Deployment | Cloud Run |
| CI/CD | Source-based deploy via `gcloud run deploy --source .` |

## Features

### UC1-UC8: Full Rental Lifecycle

| Use Case | Description | Status |
|---|---|---|
| UC1 | Member books a rental through AI concierge | Live |
| UC2 | Modify an existing reservation (two-phase change) | Live |
| UC3 | Cancel with tiered penalty preview | Live |
| UC4 | Vehicle pickup / check-in | Live |
| UC5 | In-rental support (extend, roadside) | Live |
| UC6 | Add-ons & upsells (GPS, insurance, child seat) | Live |
| UC7 | Vehicle return / drop-off with final invoice | Live |
| UC8 | Billing dispute / post-rental support | Live |

### Knowledge Graph (Neo4j-style)

Interactive force-directed graph at `/knowledge-graph.html` showing relationships between:
- **Members** (blue circles) — Costco members who book
- **Vendors** (green diamonds) — Alamo, Avis, Budget, Enterprise
- **Locations** (gold triangles) — MCO, LAX, SEA, LAS, DEN, JFK
- **Vehicle Classes** (purple squares) — 10 SIPP-coded classes
- **Reservations** (red dots) — bookings with status tracking

Click any node to see its properties and relationships. Search, filter by entity type, toggle physics simulation.

### Vendor Portal (4 Branded Dashboards)

When a booking is made on Costco Travel, it syncs in real-time to the vendor's system via the `vendor_bookings` Firestore collection.

| Vendor | Brand Color | Dashboard URL | GDS Code |
|---|---|---|---|
| Alamo | Green `#6F9E37` | `/vendor-alamo.html` | AL |
| Avis | Red `#D71920` | `/vendor-avis.html` | ZI |
| Budget | Orange `#F36E21` | `/vendor-budget.html` | ZD |
| Enterprise | Green `#007D4A` | `/vendor-enterprise.html` | ET |

Each dashboard shows: booking table with filters, revenue stats, sync event timeline, booking detail modal. Auto-refreshes every 15 seconds.

### BigQuery Analytics

Dataset `costco_travel_ai` with 4 tables:
- `conversation_events` — 200+ typed events (searches, bookings, checkins, returns)
- `daily_funnel` — 30-day search/booking/account/modification trend
- `bookings_by_provider` — revenue and active rental counts per vendor
- `most_booked_locations` — booking volume by airport

The "Demo insights" tab renders line charts and bar charts from live BigQuery data.

### GDS-Style Vendor API Simulation

Realistic vendor responses with:
- SIPP codes (ECAR, CCAR, ICAR, FCAR, SFAR, MVAR, FFAR, LCAR, PPAR, PFAR)
- Per-vendor tax breakdowns (airport concession fee, vehicle license, state sales tax, tourism surcharge)
- Costco contract rate codes and member perks
- Vendor confirmation numbers (e.g., `EZ-5038711`, `AW-12345678`)

### Member System

8 demo members with per-member login:

| Username | Password | Member |
|---|---|---|
| `member@costco.com` | `Costco123` | Sarah Johnson (default) |
| `sarah` | `admin1234` | Sarah Johnson |
| `david` | `admin1234` | David Chen |
| `emily` | `admin1234` | Emily Rodriguez |
| `robert` | `admin1234` | Robert Kim |
| `lisa` | `admin1234` | Lisa Thompson |
| `james` | `admin1234` | James Wilson |
| `maria` | `admin1234` | Maria Garcia |
| `kevin` | `admin1234` | Kevin Patel |

## Firestore Collections

| Collection | Documents | Purpose |
|---|---|---|
| `members` | 8 | Costco member profiles |
| `vendors` | 5 | Rental car companies |
| `locations` | 6 | Airport pickup locations |
| `vehicle_classes` | 10 | SIPP-coded vehicle categories |
| `inventory` | Variable | Location-specific availability |
| `contracts` | Variable | Vendor-location discount agreements |
| `reservations` | ~50 | Booking lifecycle records |
| `vendor_bookings` | ~25 | Vendor-side booking mirror |
| `audit_events` | Variable | Lifecycle audit trail |
| `member_activity` | ~110 | Member timeline (searches, logins, views) |

## Quick Start

### Prerequisites

- Google Cloud project with Firestore (Native mode), BigQuery, and Cloud Run enabled
- `gcloud` CLI authenticated
- Python 3.12+

### Local Development

```bash
# Clone
git clone https://github.com/ramamurthy-540835/costco-travel-demo.git
cd costco-travel-demo

# Set environment
export GOOGLE_CLOUD_PROJECT=ctoteam
export FIRESTORE_DATABASE=costco-demo
export RESERVATION_BACKEND=firestore
export SEED_DEMO=true
export ASSETS_BUCKET=ctoteam-costco-demo-assets
export BQ_ENABLED=true
export BQ_DATASET=costco_travel_ai

# Install and run
pip install -r requirements.txt
uvicorn app.main:app --port 8080 --reload
```

Open [http://localhost:8080](http://localhost:8080)

### Deploy to Cloud Run

```bash
gcloud run deploy costco-travel-demo \
  --source . \
  --region us-central1 \
  --project ctoteam \
  --allow-unauthenticated \
  --service-account costco-demo-run@ctoteam.iam.gserviceaccount.com \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=ctoteam,FIRESTORE_DATABASE=costco-demo,RESERVATION_BACKEND=firestore,SEED_DEMO=true,ASSETS_BUCKET=ctoteam-costco-demo-assets,BQ_ENABLED=true,BQ_DATASET=costco_travel_ai" \
  --memory 512Mi \
  --timeout 120
```

### Seed Data

```bash
# Seed member activity (110 events across 8 members)
python3 -m scripts.seed_member_activity

# Seed vendor bookings (20 bookings across 4 vendors)
GOOGLE_CLOUD_PROJECT=ctoteam FIRESTORE_DATABASE=costco-demo \
  python3 -m scripts.seed_vendor_bookings
```

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/agent/chat` | POST | AI concierge conversation |
| `/api/cars` | GET | Search rental cars (4-tier: Firestore → Vendor API → SerpAPI → static) |
| `/api/reservations` | GET/POST | List or create reservations |
| `/api/reservations/{id}` | GET | Get reservation detail |
| `/api/reservations/{id}/change/start` | POST | Start two-phase change |
| `/api/reservations/{id}/change/update` | POST | Update pending change |
| `/api/reservations/{id}/change/confirm` | POST | Confirm change |
| `/api/reservations/{id}/cancel/preview` | POST | Preview cancellation penalty |
| `/api/reservations/{id}/cancel/confirm` | POST | Confirm cancellation |
| `/api/reservations/{id}/checkin` | POST | Check in (UC4) |
| `/api/reservations/{id}/addons` | POST | Add add-on (UC6) |
| `/api/reservations/{id}/extend` | POST | Extend rental (UC5) |
| `/api/reservations/{id}/return` | POST | Return vehicle (UC7) |
| `/api/reservations/{id}/dispute` | POST | Open dispute (UC8) |
| `/api/members/{id}` | GET | Member profile |
| `/api/members/{id}/activity` | GET | Member activity timeline |
| `/api/vendors` | GET | Costco partner vendors |
| `/api/locations` | GET | Active pickup locations |
| `/api/inventory?location=SEA` | GET | Location inventory |
| `/api/analytics` | GET | BigQuery analytics |
| `/api/knowledge-graph` | GET | Graph nodes and edges for visualization |
| `/api/vendor-portal/{vendor_id}/dashboard` | GET | Vendor dashboard stats |
| `/api/vendor-portal/{vendor_id}/bookings` | GET | Vendor bookings |
| `/api/addons` | GET | Available add-ons catalog |

## Pages

| URL | Description |
|---|---|
| `/` | AI Concierge (main app) |
| `/knowledge-graph.html` | Neo4j-style knowledge graph |
| `/vendor-portal.html` | Vendor portal hub (all 4 vendors) |
| `/vendor-alamo.html` | Alamo operations dashboard |
| `/vendor-avis.html` | Avis operations dashboard |
| `/vendor-budget.html` | Budget operations dashboard |
| `/vendor-enterprise.html` | Enterprise operations dashboard |
| `/uc1-rental-mock.html` | UC1 booking flow mock |
| `/uc4-pickup-mock.html` | UC4 vehicle pickup mock |
| `/uc5-support-mock.html` | UC5 in-rental support mock |
| `/uc6-addons-mock.html` | UC6 add-ons mock |
| `/uc7-return-mock.html` | UC7 vehicle return mock |
| `/uc8-dispute-mock.html` | UC8 billing dispute mock |

## Project Structure

```
app/
  main.py              FastAPI app, all API endpoints
  agent.py             Gemini AI concierge (Vertex AI)
  reservations.py      Firestore CRUD + lifecycle workflows
  car_search.py        4-tier car search (Firestore → Vendor → SerpAPI → static)
  vendor_api.py        GDS-style vendor simulation (5 vendors, 10 classes)
  vendor_portal.py     Vendor booking sync + dashboard queries
  firestore_db.py      Cached reads from 9 Firestore collections
  recommend.py         Vehicle recommendations and pricing
  analytics.py         BigQuery analytics with static fallback
  events.py            BigQuery event writer (PII-free)
  policies.py          Business rules (cancellation, change review)
  images.py            Public GCS car image URLs
  seed.py              Idempotent demo seed (runs on startup)
  sabre_mcp.py         Sabre GDS MCP documentation adapter
static/
  costco-travel-agent-v3.html    Main single-page app
  knowledge-graph.html           Neo4j-style graph visualization
  vendor-portal.html             Vendor hub page
  vendor-{alamo,avis,budget,enterprise}.html   Branded dashboards
  uc{1,4,5,6,7,8}-*-mock.html   Use case demo pages
scripts/
  seed_vendor_bookings.py        Seed 20 bookings across 4 vendors
  seed_member_activity.py        Seed 110 member activity events
  sync_commons_car_images.py     Download car images to GCS
Dockerfile                       Cloud Run container
requirements.txt                 Python dependencies
```

## Deployment Info

| Property | Value |
|---|---|
| Project | `ctoteam` |
| Region | `us-central1` |
| Service | `costco-travel-demo` |
| Service Account | `costco-demo-run@ctoteam.iam.gserviceaccount.com` |
| Firestore Database | `costco-demo` |
| BigQuery Dataset | `costco_travel_ai` |
| GCS Bucket | `ctoteam-costco-demo-assets` |
| GitHub | [ramamurthy-540835/costco-travel-demo](https://github.com/ramamurthy-540835/costco-travel-demo) |
