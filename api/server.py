from __future__ import annotations

import os
import threading
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from api.routes.bracket import router as bracket_router
from api.routes.bracket_accuracy import router as bracket_accuracy_router
from api.routes.analyzer import router as analyzer_router
from api.routes.model_stats import router as model_stats_router
from api.routes.narrative import router as narrative_router
from api.routes.results import router as results_router
from api.routes.scoreboard import router as scoreboard_router
from api.routes.predictions import router as predictions_router
from api.routes.teams import router as teams_router
from model.pipeline import MarchMadnessPipeline


def _get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    return v if v is not None and v != "" else default


def _cors_origins() -> list[str]:
    """Comma-separated CORS_ORIGINS env, or sensible local defaults for Vite dev."""
    raw = _get_env("CORS_ORIGINS", "")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://172.20.7.211:8080",
        "http://172.20.7.211:5173",
        "http://172.20.7.211:5174",
    ]


def _pipeline_bootstrap(app: FastAPI) -> None:
    """Heavy sync work: load data, features, train/load models. Runs in a background thread."""
    try:
        data_dir = _get_env("DATA_DIR", "./data") or "./data"
        standard_model_path = _get_env("STANDARD_MODEL_PATH", "")
        chaos_model_path = _get_env("CHAOS_MODEL_PATH", "")
        pipe_m = MarchMadnessPipeline(data_dir=data_dir, gender="M")
        pipe_w = MarchMadnessPipeline(data_dir=data_dir, gender="W")

        pipe_m.load_data()
        pipe_m.build_features()
        pipe_w.load_data()
        pipe_w.build_features()

        if standard_model_path and chaos_model_path and Path(standard_model_path).exists() and Path(chaos_model_path).exists():
            from model.training.standard_model import MarchMadnessEnsemble
            from model.training.chaos_model import ChaosModel

            pipe_m.standard_model = MarchMadnessEnsemble.load(standard_model_path)
            pipe_m.chaos_model = ChaosModel.load(chaos_model_path)
            pipe_w.standard_model = MarchMadnessEnsemble.load(standard_model_path)
            pipe_w.chaos_model = ChaosModel.load(chaos_model_path)
        else:
            pipe_m.train()
            pipe_w.train()

        app.state.pipeline_m = pipe_m
        app.state.pipeline_w = pipe_w
        app.state.pipeline = pipe_m
        app.state.pipeline_ready = True
        app.state.pipeline_bootstrap_error = None
    except Exception:
        app.state.pipeline_ready = False
        app.state.pipeline_bootstrap_error = traceback.format_exc()
        print("Pipeline bootstrap failed:\n" + app.state.pipeline_bootstrap_error)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Bind $PORT immediately; load/train in background (Render requires an open port quickly).
    app.state.pipeline_ready = False
    app.state.pipeline_bootstrap_error = None
    app.state.pipeline_m = None
    app.state.pipeline_w = None
    app.state.pipeline = None

    threading.Thread(target=_pipeline_bootstrap, args=(app,), name="pipeline-bootstrap", daemon=True).start()
    yield


app = FastAPI(
    title="Akhi's March Madness App",
    version="0.1.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _require_pipeline_ready(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        if not getattr(request.app.state, "pipeline_ready", False):
            return JSONResponse(
                status_code=503,
                content={"detail": "Model pipeline is still loading. Retry shortly.", "path": request.url.path},
            )
    return await call_next(request)


@app.get("/api/health")
def health() -> Dict[str, Any]:
    pm = getattr(app.state, "pipeline_m", None)
    pw = getattr(app.state, "pipeline_w", None)
    err = getattr(app.state, "pipeline_bootstrap_error", None)
    ready = bool(getattr(app.state, "pipeline_ready", False)) and pm is not None and pw is not None
    return {
        "status": "error" if err else "ok",
        "ready": ready,
        "bootstrap_error": err,
        "gender_m": getattr(pm, "gender", None),
        "gender_w": getattr(pw, "gender", None),
        "cors_origins_configured": len(_cors_origins()),
    }


@app.get("/api/catalog")
def api_catalog() -> Dict[str, Any]:
    """Lightweight route discovery for operators and frontend devs."""
    return {
        "service": "Akhi's March Madness API",
        "version": "0.1.0",
        "routes": [
            {"path": "/api/health", "methods": ["GET"]},
            {"path": "/api/catalog", "methods": ["GET"]},
            {"path": "/api/teams/{season}", "methods": ["GET"]},
            {"path": "/api/matchup/{team1_id}/{team2_id}", "methods": ["GET"]},
            {"path": "/api/team/{team_id}/stats", "methods": ["GET"]},
            {"path": "/api/narrative/{team1_id}/{team2_id}", "methods": ["GET"]},
            {"path": "/api/bracket/simulate", "methods": ["GET"]},
            {"path": "/api/bracket/first-round", "methods": ["GET"]},
            {"path": "/api/bracket/round-matchups", "methods": ["POST"]},
            {"path": "/api/bracket/pick", "methods": ["POST"]},
            {"path": "/api/bracket/accuracy", "methods": ["GET"]},
            {"path": "/api/bracket/favorite-picks", "methods": ["GET"]},
            {"path": "/api/results/{season}", "methods": ["GET"]},
            {"path": "/api/scoreboard/live", "methods": ["GET"]},
            {"path": "/api/model/performance", "methods": ["GET"]},
            {"path": "/api/upset-picks", "methods": ["GET"]},
            {"path": "/api/analyzer/submission-stats", "methods": ["GET"]},
        ],
    }


app.include_router(teams_router)
app.include_router(predictions_router)
app.include_router(bracket_router)
app.include_router(bracket_accuracy_router)
app.include_router(results_router)
app.include_router(scoreboard_router)
app.include_router(model_stats_router)
app.include_router(narrative_router)
app.include_router(analyzer_router)


def _mount_static() -> None:
    # For production: serve the built React app.
    # This repo keeps the React project in `march-madness-insight/`.
    repo_root = Path(__file__).resolve().parents[1]

    # Important: mount narrower static paths BEFORE mounting `/`, otherwise
    # the `/` StaticFiles mount can swallow `/teamlogo/*` and produce 404s.
    teamlogo_dir = repo_root / "teamlogo"
    if teamlogo_dir.exists():
        app.mount("/teamlogo", StaticFiles(directory=str(teamlogo_dir), html=False), name="teamlogo")

    dist_candidates = [
        repo_root / "march-madness-insight" / "dist",
        repo_root / "web" / "dist",
    ]
    for dist_dir in dist_candidates:
        if dist_dir.exists():
            app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="static")
            break


_mount_static()

