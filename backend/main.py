import os
import json
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Import Multi-Agent Crew & Knowledge Graph engines
from crew_engine import run_support_crew
from kg_rag import get_or_load_graphs
from memory_manager import memory_db

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan Startup Pre-Warming:
    Pre-loads NetworkX Knowledge Graphs (EN & TA) and Okapi BM25 index on boot
    to guarantee 0ms cold start latency for the first user request.
    """
    print("\n🚀 [FastAPI Startup] Pre-warming Tamil Nadu Knowledge Graphs & Okapi BM25 Index...")
    try:
        get_or_load_graphs()
        print("✅ [FastAPI Startup] Knowledge Graphs & BM25 Indexes successfully cached in memory!\n")
    except Exception as e:
        print(f"⚠️ [FastAPI Startup Warning] Failed to pre-warm graph cache: {e}")
    yield
    print("🛑 [FastAPI Shutdown] Server stopping...")


app = FastAPI(
    title="Buildathon Multi-Agent Customer Support API",
    description="Knowledge Graph RAG + Multi-Agent Support System (FastAPI + CrewAI/LangChain + Next.js)",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Next.js frontend (localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response Pydantic Schemas
# ---------------------------------------------------------------------------
class ChatHistoryItem(BaseModel):
    role: str
    text: str


class ChatRequest(BaseModel):
    session_id: str = "default_session"
    message: str
    language: Optional[str] = "en"
    chat_history: Optional[List[ChatHistoryItem]] = []


class ChatResponse(BaseModel):
    status: str = "success"
    response: str
    is_rejected: bool = False
    language: str = "en"


# ---------------------------------------------------------------------------
# 1. Main Chat Endpoint (POST /chat)
# ---------------------------------------------------------------------------
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Executes the 3-Agent Support System (Assistant KG-RAG -> Web Search -> Entry Agent)
    with Multi-Turn Context and SQLite Long-Term Memory.
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        # Run the Multi-Agent Crew in a thread to keep FastAPI non-blocking
        result = await asyncio.to_thread(
            run_support_crew,
            query=request.message,
            language=request.language or "en",
            session_id=request.session_id,
            chat_history=request.chat_history or []
        )

        return ChatResponse(
            status="success",
            response=result["response"],
            is_rejected=result.get("is_rejected", False),
            language=result.get("language", request.language or "en")
        )
    except Exception as e:
        print(f"Chat execution error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# 2. Streaming Chat Endpoint (POST /chat/stream)
# ---------------------------------------------------------------------------
@app.post("/chat/stream")
async def chat_stream_endpoint(request: ChatRequest):
    """
    Streams the Multi-Agent response via Server-Sent Events (SSE) to the Next.js UI.
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    async def event_generator():
        try:
            # Run the 3-agent pipeline with chat_history and session_id
            result = await asyncio.to_thread(
                run_support_crew,
                query=request.message,
                language=request.language or "en",
                session_id=request.session_id,
                chat_history=request.chat_history or []
            )

            full_text = result["response"]
            
            # Stream words smoothly with minimal latency
            words = full_text.split(" ")
            for i, word in enumerate(words):
                chunk = word + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                await asyncio.sleep(0.002)

            # Signal completion
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# 3. Schemes Exploration Endpoints (for Next.js Schemes Page)
# ---------------------------------------------------------------------------
@app.get("/schemes")
def get_schemes(
    search: Optional[str] = None,
    category: Optional[str] = None,
    lang: str = "en",
    limit: int = 20,
    offset: int = 0
):
    """Returns schemes list from the Knowledge Graph storage."""
    (g_en, schemes_en, _), (g_ta, schemes_ta, _) = get_or_load_graphs()
    schemes_dict = schemes_ta if lang == "ta" else schemes_en
    all_schemes = list(schemes_dict.values())

    # Apply search filter
    if search:
        s_lower = search.lower()
        all_schemes = [
            s for s in all_schemes
            if s_lower in s["name"].lower() or s_lower in s["description"].lower()
        ]

    # Apply category filter
    if category:
        c_lower = category.lower()
        all_schemes = [
            s for s in all_schemes
            if any(c_lower in c.lower() for c in s["categories"])
        ]

    total = len(all_schemes)
    paginated = all_schemes[offset : offset + limit]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "schemes": [
            {
                "scheme_name": s["name"],
                "short_title": s["short_title"],
                "slug": s["slug"],
                "level": s["level"],
                "state": s["state"],
                "categories": s["categories"],
                "tags": s["tags"],
                "brief_description": s["description"],
                "benefits": s["benefits"],
                "eligibility": s["eligibility"],
                "exclusions": "",
                "application_process": s["application_process"],
                "documents_required": s["documents_required"],
                "url": s["url"]
            }
            for s in paginated
        ]
    }


@app.get("/schemes/categories")
def get_categories(lang: str = "en"):
    """Returns all unique scheme categories from the Knowledge Graph."""
    (g_en, _, _), (g_ta, _, _) = get_or_load_graphs()
    graph = g_ta if lang == "ta" else g_en

    categories = [
        node_data["name"]
        for _, node_data in graph.nodes(data=True)
        if node_data.get("entity_type") == "Category"
    ]
    return {"categories": sorted(list(set(categories)))}


@app.get("/schemes/detail/{slug}")
def get_scheme_detail(slug: str, lang: str = "en"):
    """Returns full details of a specific scheme."""
    (g_en, schemes_en, _), (g_ta, schemes_ta, _) = get_or_load_graphs()
    schemes_dict = schemes_ta if lang == "ta" else schemes_en
    scheme = schemes_dict.get(slug.lower().strip())

    if not scheme:
        # Fallback check
        scheme = schemes_en.get(slug.lower().strip())
        if not scheme:
            raise HTTPException(status_code=404, detail="Scheme not found")

    return {
        "scheme_name": scheme["name"],
        "short_title": scheme["short_title"],
        "slug": scheme["slug"],
        "level": scheme["level"],
        "state": scheme["state"],
        "categories": scheme["categories"],
        "tags": scheme["tags"],
        "brief_description": scheme["description"],
        "benefits": scheme["benefits"],
        "eligibility": scheme["eligibility"],
        "exclusions": "",
        "application_process": scheme["application_process"],
        "documents_required": scheme["documents_required"],
        "url": scheme["url"]
    }


# ---------------------------------------------------------------------------
# 4. Live Admin & Analytics Dashboard Endpoints
# ---------------------------------------------------------------------------
@app.get("/stats")
def get_stats():
    """Returns live system stats from persistent SQLite memory for the dashboard."""
    (g_en, schemes_en, _), _ = get_or_load_graphs()
    return memory_db.get_system_stats(total_schemes=len(schemes_en))


@app.get("/admin/unanswered-queries")
def get_unanswered_queries():
    """Returns list of unanswered / flagged queries from SQLite for admin review."""
    return {"unanswered_queries": memory_db.get_unanswered_queries()}


class UpdateStatusRequest(BaseModel):
    id: int
    status: str


@app.post("/admin/unanswered-queries/status")
def update_unanswered_query_status(req: UpdateStatusRequest):
    """Updates query status in SQLite database."""
    success = memory_db.update_unanswered_query_status(req.id, req.status)
    return {
        "status": "success" if success else "error",
        "id": req.id,
        "new_status": req.status
    }


@app.get("/")
def root():
    return {
        "status": "online",
        "message": "Buildathon Multi-Agent Support System API is running.",
        "endpoints": ["/chat", "/chat/stream", "/schemes", "/schemes/categories", "/stats", "/admin/unanswered-queries"]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
