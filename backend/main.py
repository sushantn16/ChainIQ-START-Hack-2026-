"""
FastAPI application — API routes and startup.
"""

import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from backend.data_loader import get_store
from backend.models import ProcessRequest, PipelineResult
from backend.pipeline import process_request, process_request_streaming

app = FastAPI(
    title="ChainIQ Sourcing Agent",
    description="Audit-Ready Autonomous Sourcing Agent — START Hack 2026",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve built frontend
STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"


@app.on_event("startup")
def startup():
    """Load all data into memory on startup."""
    store = get_store()
    print(f"Loaded: {len(store.requests)} requests, {len(store.suppliers)} supplier rows, "
          f"{len(store.pricing)} pricing rows, {len(store.historical_awards)} awards")


@app.post("/api/process", response_model=PipelineResult)
def api_process(req: ProcessRequest):
    """Process a single request — by request_id or free-text."""
    if not req.request_id and not req.request_text:
        raise HTTPException(400, "Provide either request_id or request_text")
    return process_request(req)


@app.post("/api/process/stream")
async def api_process_stream(req: ProcessRequest):
    """Process a request with SSE streaming of pipeline steps."""
    if not req.request_id and not req.request_text:
        raise HTTPException(400, "Provide either request_id or request_text")

    def event_generator():
        for item in process_request_streaming(req):
            step, detail = item[0], item[1]
            data = item[2] if len(item) > 2 else None
            event = {"step": step, "detail": detail}
            if step == "done" and data is not None:
                # The "done" step passes the PipelineResult as item[2]
                event["result"] = data.model_dump()
            elif data is not None:
                event["data"] = data
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/requests")
def api_list_requests(limit: int = 50, offset: int = 0, scenario_tag: str | None = None):
    """List requests with optional filtering."""
    store = get_store()
    items = list(store.requests.values())

    if scenario_tag:
        items = [r for r in items if scenario_tag in r.get("scenario_tags", [])]

    total = len(items)
    items = items[offset:offset + limit]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [
            {
                "request_id": r["request_id"],
                "title": r.get("title", ""),
                "category_l1": r.get("category_l1"),
                "category_l2": r.get("category_l2"),
                "country": r.get("country"),
                "currency": r.get("currency"),
                "budget_amount": r.get("budget_amount"),
                "quantity": r.get("quantity"),
                "scenario_tags": r.get("scenario_tags", []),
                "preferred_supplier_mentioned": r.get("preferred_supplier_mentioned"),
            }
            for r in items
        ],
    }


@app.get("/api/requests/{request_id}")
def api_get_request(request_id: str):
    """Get full details of a single request."""
    store = get_store()
    if request_id not in store.requests:
        raise HTTPException(404, f"Request {request_id} not found")
    return store.requests[request_id]


@app.post("/api/batch")
def api_batch(request_ids: list[str] | None = None, limit: int = 20):
    """Process multiple requests and return results + aggregate stats."""
    store = get_store()

    if request_ids:
        ids = request_ids
    else:
        ids = list(store.requests.keys())[:limit]

    results = []
    stats = {"total": len(ids), "recommend": 0, "recommend_with_escalation": 0, "cannot_proceed": 0}

    for rid in ids:
        try:
            result = process_request(ProcessRequest(request_id=rid))
            results.append(result)
            stats[result.recommendation.status] = stats.get(result.recommendation.status, 0) + 1
        except Exception as e:
            stats["cannot_proceed"] += 1

    return {"stats": stats, "results": results}


@app.get("/api/suppliers")
def api_suppliers():
    """List all unique suppliers with aggregate info."""
    store = get_store()
    suppliers = {}
    for s in store.suppliers:
        sid = s["supplier_id"]
        if sid not in suppliers:
            suppliers[sid] = {
                "supplier_id": sid,
                "supplier_name": s["supplier_name"],
                "country_hq": s["country_hq"],
                "categories": [],
                "quality_score": s["quality_score"],
                "risk_score": s["risk_score"],
                "esg_score": s["esg_score"],
                "preferred": s["preferred_supplier"],
                "restricted": s["is_restricted"],
            }
        suppliers[sid]["categories"].append(f"{s['category_l1']}/{s['category_l2']}")
    return list(suppliers.values())


@app.get("/api/policies")
def api_policies():
    """Return policy summary."""
    store = get_store()
    p = store.policies
    return {
        "approval_tiers": len(p.get("approval_thresholds", [])),
        "preferred_suppliers": len(p.get("preferred_suppliers", [])),
        "restricted_suppliers": len(p.get("restricted_suppliers", [])),
        "category_rules": len(p.get("category_rules", [])),
        "geography_rules": len(p.get("geography_rules", [])),
        "escalation_rules": len(p.get("escalation_rules", [])),
    }


@app.get("/api/dashboard")
def api_dashboard():
    """Quick stats without processing all requests."""
    store = get_store()
    from collections import Counter
    tags = Counter()
    for r in store.requests.values():
        for t in r.get("scenario_tags", []):
            tags[t] += 1

    return {
        "total_requests": len(store.requests),
        "total_suppliers": len(set(s["supplier_id"] for s in store.suppliers)),
        "total_pricing_rows": len(store.pricing),
        "total_awards": len(store.historical_awards),
        "requests_with_awards": len(set(a["request_id"] for a in store.historical_awards)),
        "scenario_tag_distribution": dict(tags),
    }


# --- Serve frontend static files (must be after all /api routes) ---
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        """Serve frontend files, fallback to index.html for SPA routing."""
        file_path = STATIC_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
