# MarchMadnessModel

AI-powered March Madness 2026 platform with a FastAPI backend, React frontend, bracket simulation, live scoreboard, betting assistant, and model performance tracking.

## Features

- Bracket picker with round navigation and saved brackets
- Live bracket view with completed-game winner overrides
- Live scoreboard with model win probabilities
- Betting assistant with +EV picks, Kelly sizing, and analysis panel
- Model Analyzer with calibration, Brier score, and game log
- Kaggle evaluator for submission analysis and metrics

## Tech Stack

- **Backend:** Python, FastAPI, pandas, scikit-learn
- **Frontend:** React, Vite, TypeScript, TanStack Query, Tailwind/shadcn
- **Data:** NCAA/Kaggle tournament datasets + cached result files

## Project Structure

- `api/` - FastAPI routes and server bootstrap
- `model/` - training/pipeline and feature engineering code
- `data/` - NCAA CSVs, caches, and submissions
- `march-madness-insight/` - React frontend app
- `teamlogo/` - local logo assets

## Local Setup

### 1) Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn api.server:app --reload --host 127.0.0.1 --port 8000
```

### 2) Frontend

```bash
cd march-madness-insight
npm install
cp .env.example .env
npm run dev
```

Frontend default: `http://localhost:8080`  
Backend default: `http://127.0.0.1:8000`

## Environment Variables

Root `.env`:

- `ANTHROPIC_API_KEY` - optional, enables narrative analysis endpoints

Frontend `march-madness-insight/.env`:

- `VITE_API_BASE_URL` - backend URL (default `http://localhost:8000`)
- `VITE_ODDS_API_KEY` - optional, enables live odds feed

## Useful Commands

From `march-madness-insight/`:

```bash
npm run check
npm run build
```

From repo root:

```bash
uvicorn api.server:app --reload --host 127.0.0.1 --port 8000
```

## API Quick Endpoints

- `GET /api/health`
- `GET /api/catalog`
- `GET /api/scoreboard/live`
- `GET /api/model/performance`
- `GET /api/results/{season}`
- `GET /api/bracket/first-round`
- `POST /api/bracket/round-matchups`

## Notes

- This repo includes cached tournament/result files for faster local testing.
- Live feeds (scoreboard/odds) can be rate-limited or blocked; fallback cache paths are used where available.
