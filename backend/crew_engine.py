import os
import requests
import concurrent.futures
from datetime import datetime
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

# Import KG RAG engine & NeMo Guardrails
from kg_rag import query_knowledge_graph, is_tamil_text
from guardrails_engine import evaluate_nemo_guardrails

# Load environment variables
load_dotenv()


def execute_web_search(query: str) -> str:
    """Searches Google via Serper API for the latest updates, portals, and info."""
    serper_api_key = os.environ.get("SERPER_API_KEY", "")
    if not serper_api_key:
        return "Web search skipped: SERPER_API_KEY is not set."

    url = "https://google.serper.dev/search"
    headers = {
        "X-API-KEY": serper_api_key,
        "Content-Type": "application/json"
    }
    payload = {"q": f"{query} Tamil Nadu agriculture scheme", "num": 4}

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            results = []
            for item in data.get("organic", [])[:3]:
                title = item.get("title", "")
                snippet = item.get("snippet", "")
                link = item.get("link", "")
                results.append(f"- **{title}**: {snippet}\n  Link: {link}")
            return "\n".join(results) if results else "No web results found."
        return f"Web search returned status code: {resp.status_code}"
    except Exception as e:
        return f"Web search error: {str(e)}"


def append_to_answers_file(query: str, assistant_ans: str, web_ans: str, file_path: str = "agent_audit_log.txt"):
    """Saves the user query, assistant answer, and web search answer into agent_audit_log.txt."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"""
================================================================================
Timestamp: {timestamp}
Query: {query}
--------------------------------------------------------------------------------
[1. ASSISTANT KNOWLEDGE GRAPH ANSWER]:
{assistant_ans}
--------------------------------------------------------------------------------
[2. WEB SEARCH ASSISTANT ANSWER]:
{web_ans}
================================================================================

"""
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(entry)
    print(f"Logged query and answers to {file_path}")


def _run_agent1(llm: ChatOpenAI, query: str, lang_code: str, target_language_name: str) -> str:
    """Agent 1: Customer Support Assistant (Knowledge Graph RAG + BM25)."""
    kg_found, kg_context = query_knowledge_graph(query, lang=lang_code, top_k=2)
    assistant_prompt = [
        SystemMessage(content=(
            f"You are the Customer Support Assistant. Always respond in {target_language_name}.\n"
            "Your job is to answer user queries using facts from the internal Knowledge Graph database.\n"
            "Explain the benefits, eligibility criteria, application process, required documents, "
            "and official portal links clearly in Markdown."
        )),
        HumanMessage(content=f"User Query: {query}\n\nRetrieved Knowledge Graph Context:\n{kg_context}")
    ]
    return llm.invoke(assistant_prompt).content


def _run_agent2(llm: ChatOpenAI, query: str, target_language_name: str) -> str:
    """Agent 2: Web Search Assistant (Live Serper Google API)."""
    raw_web_results = execute_web_search(query)
    web_agent_prompt = [
        SystemMessage(content=(
            f"You are the Web Search Assistant. Always respond in {target_language_name}.\n"
            "Your role is to search the web for the latest updates, deadlines, official government "
            "announcements, and relevant portals.\n"
            "Summarize the web findings clearly with sources and hyperlinks."
        )),
        HumanMessage(content=f"User Query: {query}\n\nLive Web Search Results:\n{raw_web_results}")
    ]
    return llm.invoke(web_agent_prompt).content


def run_support_crew(query: str, language: Optional[str] = None) -> Dict[str, Any]:
    """
    High-Performance Concurrent Multi-Agent Engine:
    Step 0: NVIDIA NeMo Guardrails Check (0ms fast path for greetings & in-domain keywords)
    Step 1 & 2: Agent 1 (Graph RAG) & Agent 2 (Web Search) executed CONCURRENTLY in parallel
    Step 3: Agent 3 (Entry Agent) synthesizes final unified response & logs to answers.txt
    """
    lang_code = language if language in ("en", "ta") else ("ta" if is_tamil_text(query) else "en")
    target_language_name = "Tamil (தமிழ்)" if lang_code == "ta" else "English"

    openai_api_key = os.environ.get("OPENAI_API_KEY", "")
    model_name = os.environ.get("OPENAI_MODEL_NAME", "gpt-4o-mini")
    llm = ChatOpenAI(api_key=openai_api_key, model=model_name, temperature=0.2)

    # ---------------------------------------------------------
    # STEP 0: NeMo Guardrails Input Rail Check
    # ---------------------------------------------------------
    rail_status, rail_message = evaluate_nemo_guardrails(query, target_lang=lang_code, llm=llm)

    if rail_status in ("GREETING", "OFF_TOPIC"):
        print(f"[NeMo Guardrails Triggered]: Status '{rail_status}' for query '{query}'")
        return {
            "query": query,
            "language": lang_code,
            "is_rejected": (rail_status == "OFF_TOPIC"),
            "assistant_answer": rail_message,
            "web_search_answer": "N/A",
            "response": rail_message
        }

    # ---------------------------------------------------------
    # STEP 1 & 2: Run Agent 1 and Agent 2 CONCURRENTLY
    # ---------------------------------------------------------
    print(f"\n[Parallel Execution] Running Agent 1 (KG-RAG) & Agent 2 (Web Search) simultaneously for: '{query}'...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_agent1 = executor.submit(_run_agent1, llm, query, lang_code, target_language_name)
        future_agent2 = executor.submit(_run_agent2, llm, query, target_language_name)
        
        assistant_response = future_agent1.result()
        web_response = future_agent2.result()
    print("[Parallel Execution] Both Agent 1 and Agent 2 completed simultaneously.")

    # ---------------------------------------------------------
    # AGENT 3: Entry Agent (Combine, Save & Format)
    # ---------------------------------------------------------
    print(f"\n[Agent 3: Entry Agent] Compiling final report in {target_language_name} & saving to answers.txt...")
    entry_agent_prompt = [
        SystemMessage(content=(
            f"You are the Entry Agent. Always respond in {target_language_name}.\n"
            "Synthesize a comprehensive, authoritative response for the farmer with high factual precision:\n"
            "1. **Scheme Overview & Financial Benefits / Subsidy Details** (explicitly mention amounts and subsidies)\n"
            "2. **Eligibility Criteria & Target Beneficiaries**\n"
            "3. **Step-by-Step Application Process** (specify the relevant office to visit: Agricultural Office / வேளாண் அலுவலகம் / வேளாண்மைத்துறை)\n"
            "4. **Mandatory Required Documents**\n"
            "5. **Official Portal & Web Guidelines Links** (clickable Markdown links)\n\n"
            "Retain all factual data from the Assistant and live web search findings."
        )),
        HumanMessage(content=(
            f"User Query: {query}\n\n"
            f"--- Assistant Graph Answer ---\n{assistant_response}\n\n"
            f"--- Web Search Answer ---\n{web_response}"
        ))
    ]
    final_output = llm.invoke(entry_agent_prompt).content

    # Save to agent_audit_log.txt
    answers_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_audit_log.txt")
    append_to_answers_file(query, assistant_response, web_response, answers_file_path)

    return {
        "query": query,
        "language": lang_code,
        "is_rejected": False,
        "assistant_answer": assistant_response,
        "web_search_answer": web_response,
        "response": final_output
    }
