"""HTTP API for the game (FastAPI). Run from the repo root:

    research/.venv/bin/python -m uvicorn ravenswood.server:app --app-dir backend --port 8000

The Vite dev server proxies ``/api`` here, so the browser never sees CORS.

    GET  /api/health                        is Ollama up, which voice model
    POST /api/session                       new save: seeds every suspect's memory stream
    GET  /api/session/{save_id}             does this save exist, what time is it
    POST /api/ask                           one interview turn (answer + kind + tell + trace)
    POST /api/advance                       move the clock (walking, searching)
    GET  /api/memories/{save_id}/{suspect}  Memory Inspector: every trace and its state now
    GET  /api/log/{save_id}                 the full interview log (research export)
    POST /api/act                           a deed: strike, draw, shoot, bribe, watch, take/refuse a bribe…
    GET  /api/world/{save_id}               the house now: moods, where everyone is, the day's events
    POST /api/clue                          the player found a clue (the killer's nerve reacts to it)
    POST /api/verdict                       how the case ends, given the accusation and evidence

After every turn the suspects who lived through something new reflect in a
background thread (agent.Engine.reflect_pending), so off-screen thought never
makes the player wait.
"""

from __future__ import annotations

import threading

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from lcmem import ModelParams

from . import config
from .agent import Engine, NotHere, clock_label
from .world import DEEDS, TONES
from .characters import CHARACTERS
from .fallible import FallibleMemory
from .ollama import Voice, available_models, default_embeddings, pick_model
from .store import MemoryStore

app = FastAPI(title="Ravenswood suspects", version="1.0")

_base = ModelParams.load(config.FITTED_PARAMS) if config.FITTED_PARAMS.exists() else ModelParams()
engine = Engine(MemoryStore(config.DB_PATH), default_embeddings(), Voice(), _base)


class NewSession(BaseModel):
    difficulty: str = "detective"
    memory_mode: str = Field("fallible", pattern="^(fallible|perfect)$")


class AskIn(BaseModel):
    save_id: str
    suspect_id: str
    question: str = Field(..., min_length=1, max_length=400)
    tone: str | None = None


class ActIn(BaseModel):
    save_id: str
    suspect_id: str
    deed: str


class ClueIn(BaseModel):
    save_id: str
    clue_id: str


class VerdictIn(BaseModel):
    save_id: str
    accused: str | None = None
    evidence: list[str] = []


_reflecting: set[str] = set()


def _reflect_later(save_id: str) -> None:
    """Let the suspects think between turns, without making the player wait."""
    if save_id in _reflecting:
        return
    _reflecting.add(save_id)

    def run() -> None:
        try:
            engine.reflect_pending(save_id)
        except Exception:  # noqa: BLE001 - a lost reflection is never worth a crash
            pass
        finally:
            _reflecting.discard(save_id)

    threading.Thread(target=run, daemon=True).start()


class AdvanceIn(BaseModel):
    save_id: str
    minutes: float = Field(..., ge=0, le=24 * 60)
    player: list[int] | None = None   # the detective's tile: who sees what, who is alone


def _require(save_id: str) -> dict:
    sess = engine.store.session(save_id)
    if sess is None:
        raise HTTPException(404, "unknown save")
    return sess


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def root() -> str:
    """Opening this server in a browser is a common mix-up: point to the game instead."""
    return (
        "<!doctype html><meta charset=utf-8><title>Ravenswood — suspects' memory server</title>"
        "<body style='font-family:system-ui;background:#141110;color:#efe4cf;padding:2rem;line-height:1.5'>"
        "<h1 style='color:#f4b860'>This is the suspects’ memory server, not the game</h1>"
        "<p>It has no pages of its own — the game talks to it. Open the game at "
        "<a style='color:#f4b860' href='http://localhost:5173'>http://localhost:5173</a>.</p>"
        "<p>If that page does not load, the game is not running: in a second terminal run "
        "<code>npm run dev</code> — or stop this and run <code>npm run play</code>, which starts both.</p>"
        f"<p style='color:#b8a888'>Status: voice model <code>{engine.voice.model}</code> · "
        "<a style='color:#b8a888' href='/api/health'>/api/health</a></p></body>"
    )


def _best_voice(models: list[str]) -> None:
    """Switch to the best installed voice — e.g. right after `ollama pull qwen2.5:3b` —
    without restarting the server (or once Ollama comes up after it)."""
    best = pick_model(models) if models else None
    if best and best != engine.voice.model:
        engine.voice = Voice(best)


@app.get("/api/health")
def health() -> dict:
    models = available_models()
    _best_voice(models)
    return {"ok": True, "ollama": bool(models), "model": engine.voice.model,
            "embed_model": config.EMBED_MODEL, "models": models}


@app.post("/api/session")
def new_session(body: NewSession) -> dict:
    _best_voice(available_models())
    try:
        save_id = engine.new_session(body.difficulty, body.memory_mode)
    except Exception as e:  # noqa: BLE001 - embedding needs Ollama
        raise HTTPException(503, f"could not seed memories (is Ollama running?): {e}") from e
    sess = engine.store.session(save_id)
    return {"save_id": save_id, "clock": sess["clock"], "clock_label": clock_label(sess["clock"])}


@app.get("/api/session/{save_id}")
def get_session(save_id: str) -> dict:
    sess = _require(save_id)
    return {**sess, "clock_label": clock_label(sess["clock"])}


@app.post("/api/ask")
def ask(body: AskIn) -> dict:
    _require(body.save_id)
    if body.suspect_id not in CHARACTERS:
        raise HTTPException(404, "unknown suspect")
    tone = body.tone if body.tone in TONES else None
    try:
        a = engine.ask(body.save_id, body.suspect_id, body.question.strip(), tone)
    except NotHere as e:
        raise HTTPException(409, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"suspect could not answer: {e}") from e
    _reflect_later(body.save_id)
    return {"answer": a.answer, "kind": a.kind, "observation": a.observation,
            "reveals_clue": a.reveals_clue, "trace": a.trace, "notices": a.notices, "world": a.world,
            "clock": a.clock, "clock_label": clock_label(a.clock)}


@app.post("/api/act")
def act(body: ActIn) -> dict:
    _require(body.save_id)
    if body.suspect_id not in CHARACTERS or body.deed not in DEEDS:
        raise HTTPException(404, "unknown suspect or deed")
    try:
        out = engine.act(body.save_id, body.suspect_id, body.deed)
    except NotHere as e:
        raise HTTPException(409, str(e)) from e
    _reflect_later(body.save_id)
    return out


@app.get("/api/world/{save_id}")
def world(save_id: str) -> dict:
    _require(save_id)
    out = engine.world_view(save_id)
    _reflect_later(save_id)
    return out


@app.post("/api/clue")
def clue(body: ClueIn) -> dict:
    _require(body.save_id)
    return engine.note_clue(body.save_id, body.clue_id)


@app.post("/api/verdict")
def verdict(body: VerdictIn) -> dict:
    _require(body.save_id)
    return engine.verdict(body.save_id, body.accused, body.evidence)


@app.post("/api/advance")
def advance(body: AdvanceIn) -> dict:
    _require(body.save_id)
    clock = engine.advance(body.save_id, body.minutes, body.player)
    _reflect_later(body.save_id)
    return {"clock": clock, "clock_label": clock_label(clock), "world": engine.world_view(body.save_id)}


@app.get("/api/memories/{save_id}/{suspect_id}")
def memories(save_id: str, suspect_id: str) -> dict:
    sess = _require(save_id)
    if suspect_id not in CHARACTERS:
        raise HTTPException(404, "unknown suspect")
    now = sess["clock"]
    fm = FallibleMemory(CHARACTERS[suspect_id], engine.base, sess["memory_mode"])
    out = []
    for m in engine.store.memories(save_id, suspect_id):
        r = fm.assess(m, now, 0.0, 0.0, save_id)
        out.append({**m.public(), "state": r.state, "source_known": r.source_known,
                    "p_detail": round(r.p_detail, 3), "p_gist": round(r.p_gist, 3),
                    "p_source": round(r.p_source, 3)})
    return {"clock": now, "clock_label": clock_label(now), "memories": out}


@app.get("/api/log/{save_id}")
def log(save_id: str) -> dict:
    _require(save_id)
    return {"turns": engine.store.all_turns(save_id)}
