import os
import sys
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Ensure backend directory is in python search path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

load_dotenv()

# Import existing core components from backend/
from kg_rag import query_knowledge_graph, is_tamil_text, get_or_load_graphs
from guardrails_engine import evaluate_nemo_guardrails
from memory_manager import memory_db, PersistentSQLiteMemory
from crew_engine import execute_web_search, run_support_crew


def create_crewai_with_backend_integrations(db_path: Optional[str] = None):
    """
    Initializes CrewAI Multi-Agent Pipeline integrating:
    1. Custom Persistent SQLite Long-Term Memory (LTMSQLiteStorage)
    2. Knowledge Graph RAG Tool from backend/kg_rag.py
    3. Serper Web Search Tool from backend/crew_engine.py
    4. Memory Recall Tool from backend/memory_manager.py
    """
    try:
        from crewai import Agent, Task, Crew, Process
        from crewai.memory import LongTermMemory
        from crewai.memory.storage.ltm_sqlite_storage import LTMSQLiteStorage
        from crewai.tools import tool

        db_file = db_path or os.path.join(BACKEND_DIR, "graph_storage", "long_term_memory_storage.db")
        os.makedirs(os.path.dirname(os.path.abspath(db_file)), exist_ok=True)

        # -------------------------------------------------------------
        # 1. Custom Tools Wrapping Existing Backend Logic
        # -------------------------------------------------------------
        @tool("Query Knowledge Graph RAG")
        def knowledge_graph_tool(query: str) -> str:
            """Queries the Tamil Nadu agricultural knowledge graph for official scheme rules, eligibility, benefits, and required documents."""
            lang = "ta" if is_tamil_text(query) else "en"
            _, context = query_knowledge_graph(query, lang=lang, top_k=2)
            return context

        @tool("Search Live Government Web Updates")
        def web_search_tool(query: str) -> str:
            """Searches Google for live application deadlines, active announcements, and official government portal URLs."""
            return execute_web_search(query)

        @tool("Recall Past Resolutions from SQLite")
        def memory_recall_tool(query: str) -> str:
            """Recalls previously resolved farmer queries and answers from the persistent SQLite Long-Term Memory."""
            past = memory_db.recall_relevant_memories(query, limit=2)
            if not past:
                return "No previous related questions found in Long-Term Memory."
            return "\n".join([f"- Past Query: {m['query']}\n  Answer: {m['final_answer'][:250]}..." for m in past])

        # -------------------------------------------------------------
        # 2. Custom Persistent SQLite Long-Term Memory
        # -------------------------------------------------------------
        ltm_storage = LTMSQLiteStorage(db_path=db_file)
        custom_ltm = LongTermMemory(storage=ltm_storage)

        # -------------------------------------------------------------
        # 3. Define CrewAI Agents with Backend Tools
        # -------------------------------------------------------------
        assistant = Agent(
            role="Customer Support Assistant",
            goal="Provide accurate scheme benefits, subsidies, eligibility, and steps using internal Knowledge Graph and past memories.",
            backstory="You are an expert government customer support specialist with deep knowledge of Tamil Nadu agricultural schemes.",
            tools=[knowledge_graph_tool, memory_recall_tool],
            verbose=True
        )

        web_assistant = Agent(
            role="Web Search Assistant",
            goal="Verify active deadlines, announcements, and official government portal application links.",
            backstory="You are an online research specialist verifying active guidelines, official URLs, and application portals.",
            tools=[web_search_tool],
            verbose=True
        )

        entry_agent = Agent(
            role="Entry Agent",
            goal="Synthesize Assistant domain facts and Web findings into a clear, structured Markdown report.",
            backstory="You are a senior documentation compiler structuring final answers with financial amounts, steps, and clickable links.",
            verbose=True
        )

        # -------------------------------------------------------------
        # 4. Define Tasks
        # -------------------------------------------------------------
        task1 = Task(
            description="Retrieve grounded facts from Knowledge Graph and past SQLite memories for query: {query}",
            expected_output="Detailed scheme overview, benefits, eligibility criteria, and required documents.",
            agent=assistant
        )

        task2 = Task(
            description="Find live government application links and active announcements for query: {query}",
            expected_output="Official application portal URLs and recent updates.",
            agent=web_assistant
        )

        task3 = Task(
            description="Synthesize findings into an authoritative final Markdown answer.",
            expected_output="Complete structured report formatted with Overview, Benefits, Eligibility, Steps, Documents, and Official Links.",
            agent=entry_agent
        )

        # -------------------------------------------------------------
        # 5. Build Crew with Long-Term Memory Enabled
        # -------------------------------------------------------------
        crew = Crew(
            agents=[assistant, web_assistant, entry_agent],
            tasks=[task1, task2, task3],
            process=Process.sequential,
            memory=True,                  # Enables Crew Memory
            long_term_memory=custom_ltm,  # 👈 Custom Persistent SQLite Storage
            embedder={
                "provider": "openai",
                "config": {
                    "model": "text-embedding-3-small",
                    "api_key": os.environ.get("OPENAI_API_KEY")
                }
            } if os.environ.get("OPENAI_API_KEY") else None,
            verbose=True
        )

        return crew

    except ImportError:
        return None


def execute_pipeline(query: str, session_id: str = "default_session", language: Optional[str] = None) -> Dict[str, Any]:
    """
    Unified Pipeline:
    1. Evaluates NeMo Guardrails (from backend/guardrails_engine.py).
    2. Runs CrewAI with Custom SQLite LTM (or high-speed backend multi-agent engine).
    3. Persists results to SQLite memory_db (from backend/memory_manager.py).
    """
    lang_code = language if language in ("en", "ta") else ("ta" if is_tamil_text(query) else "en")

    # Step 0: NeMo Guardrails check
    status, msg = evaluate_nemo_guardrails(query, target_lang=lang_code)
    if status in ("GREETING", "OFF_TOPIC"):
        return {
            "status": status,
            "is_rejected": (status == "OFF_TOPIC"),
            "response": msg
        }

    # Step 1: Run CrewAI if available, else run backend crew_engine
    crew = create_crewai_with_backend_integrations()
    if crew:
        print("\n🤖 [CrewAI] Running 3-Agent Crew with Custom SQLite Long-Term Memory...")
        crew_result = crew.kickoff(inputs={"query": query})
        final_text = str(crew_result)
    else:
        print("\n⚡ [Backend Engine] Running Native Multi-Agent Pipeline with SQLite LTM...")
        res = run_support_crew(query, language=lang_code, session_id=session_id)
        final_text = res["response"]

    # Step 2: Persist in SQLite memory_db
    memory_db.save_interaction(
        session_id=session_id,
        query=query,
        assistant_context="",
        web_context="",
        final_answer=final_text,
        language=lang_code
    )

    return {
        "status": "success",
        "is_rejected": False,
        "response": final_text
    }


if __name__ == "__main__":
    sample_query = "What subsidies are available for drip irrigation in Tamil Nadu?"
    print(f"Executing Multi-Agent Support Pipeline with SQLite Long-Term Memory for: '{sample_query}'\n")
    
    result = execute_pipeline(sample_query)
    print("\n================ FINAL RESPONSE ================")
    print(result["response"])
