"""KisaanAI web server: serves the dashboard (web/) and the /diagnose API on one origin.
Run locally:  uvicorn main:app --reload      Render start command:  uvicorn main:app --host 0.0.0.0 --port $PORT
Environment variables: GROQ_API_KEY (required), TAVILY_API_KEY (optional web search)."""
import base64
import json
import os
import queue
import threading
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

import agents

BASE = Path(__file__).parent
MAX_IMAGE = 8 * 1024 * 1024
MAX_AUDIO = 12 * 1024 * 1024
SHOWN = {"1 Listener", "2 Diagnosis", "3 Research", "4 Verifier", "5 Advisor"}   # steps the dashboard animates
_slots = threading.Semaphore(int(os.getenv("KISAAN_MAX_PARALLEL", "2")))         # protects the Groq rate limits

app = FastAPI(title="KisaanAI")


@app.get("/health")
def health():
    return {"app": "kisaanai", "ok": True, "key": agents.has_server_key()}


def _line(obj) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, default=str) + "\n").encode()


@app.post("/diagnose")
async def diagnose(image: UploadFile = File(...), audio: UploadFile | None = File(None),
                   typed_text: str = Form(""), district: str = Form("Lahore")):
    if not agents.has_server_key():
        raise HTTPException(500, "GROQ_API_KEY is not set on the server.")
    img = await image.read()
    aud = await audio.read() if audio else None
    if not img or len(img) > MAX_IMAGE:
        raise HTTPException(400, "Photo is missing or larger than 8 MB.")
    if aud is not None and (not aud or len(aud) > MAX_AUDIO):
        aud = None
    if not aud and not typed_text.strip():
        raise HTTPException(400, "Add a voice note or type your problem.")
    if district not in agents.DISTRICTS:
        district = "Lahore"
    aname = (audio.filename if audio and audio.filename else "voice.webm")

    q: queue.Queue = queue.Queue()
    t0 = [time.time()]

    def on_step(name, res):
        now = time.time()
        if name in SHOWN:
            q.put({"type": "step", "agent": name, "seconds": round(now - t0[0], 2)})
        t0[0] = now

    def work():
        with _slots:
            t0[0] = time.time()
            try:
                r = agents.run_pipeline(img, image.content_type or "image/jpeg", aud, district,
                                        typed_text=typed_text, on_step=on_step, audio_name=aname)
                path = r.pop("audio_path", None)
                if path and os.path.exists(path):
                    with open(path, "rb") as fh:
                        r["audio_base64"] = base64.b64encode(fh.read()).decode()
                    r["audio_mime"] = "audio/mpeg"
                    os.remove(path)
                q.put({"type": "result", "data": r})
            except Exception as e:  # shown to the user by the dashboard
                q.put({"type": "error", "message": str(e)})
            q.put(None)

    threading.Thread(target=work, daemon=True).start()

    def stream():
        while True:
            try:
                item = q.get(timeout=15)
            except queue.Empty:
                yield b"\n"          # keep-alive while a slot is busy or a model is slow
                continue
            if item is None:
                return
            yield _line(item)

    return StreamingResponse(stream(), media_type="application/x-ndjson")


app.mount("/", StaticFiles(directory=BASE / "web", html=True), name="web")
