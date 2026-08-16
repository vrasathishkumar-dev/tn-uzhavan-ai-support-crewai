import os
import re
from typing import Tuple
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

GREETING_SET = {
    "hi", "hello", "hey", "vanakkam", "வணக்கம்", "namaste", "halo",
    "good morning", "good evening", "good afternoon", "hi there", "hello there"
}

def evaluate_nemo_guardrails(query: str, target_lang: str = "en", llm: ChatOpenAI = None) -> Tuple[str, str]:
    """
    NVIDIA NeMo Guardrails Policy Evaluator:
    - Analyzes query against Colang input rails.
    - Classifies into 'GREETING', 'OFF_TOPIC', or 'ALLOWED'.
    """
    clean_q = query.strip().lower().rstrip("!.,?")
    
    # 1. Fast Rail: Greetings Check
    if clean_q in GREETING_SET or len(clean_q) <= 3:
        if target_lang == "ta":
            return "GREETING", (
                "வணக்கம்! நான் தமிழ்நாடு உழவர் நலத் திட்டங்களின் AI உதவியாளர் (NeMo Guardrails உடன்). 🌾\n\n"
                "விவசாயத் திட்டங்கள், விதை மானியம், உரம், பாசன உதவிகள் மற்றும் அரசு சலுகைகள் பற்றி என்னிடம் கேட்கலாம். "
                "உங்களுக்கு எவ்வாறு உதவ வேண்டும்?"
            )
        else:
            return "GREETING", (
                "Hello! I am your AI Support Assistant for Tamil Nadu Farmer Schemes (Protected by NeMo Guardrails). 🌾\n\n"
                "I can help you with government schemes, seed subsidies, irrigation support, fertilizers, and application procedures. "
                "How can I assist you today?"
            )

    # 2. Fast Rail: Instant In-Domain Keywords (0ms Fast-Path Bypass)
    in_domain_keywords = {
        "subsidy", "seed", "fertilizer", "farmer", "farmers", "agriculture", "agricultural",
        "crop", "crops", "irrigation", "gypsum", "tractor", "loan", "scheme", "schemes",
        "apply", "application", "eligibility", "benefit", "benefits", "document", "documents",
        "portal", "tamil nadu", "tn", "oil seed", "oil seeds", "horticulture", "organic",
        "மானியம்", "விதை", "விதைகள்", "உரம்", "விவசாயி", "விவசாயிகள்", "பயிர்", "பயிர்கள்",
        "பாசனம்", "திட்டம்", "திட்டங்கள்", "விண்ணப்பம்", "விவசாய", "உழவர்", "வேளாண்",
        "வேளாண்மை", "சான்றளிக்கப்பட்ட", "அரசு", "ஆவணங்கள்", "தகுதி", "சலுகை", "சலுகைகள்"
    }
    tokens = set(re.findall(r'\b[a-zA-Z0-9_\u0B80-\u0BFF]{2,}\b', clean_q))
    if tokens.intersection(in_domain_keywords):
        return "ALLOWED", ""

    # 3. Input Rail: Strict Off-Topic / In-Domain Classifier (for ambiguous queries only)
    if llm is not None:
        eval_prompt = [
            SystemMessage(content=(
                "You are an NVIDIA NeMo Guardrails Input Filter for a Tamil Nadu Government Agriculture & Farmer Scheme System.\n\n"
                "TASK: Evaluate if the user's query is IN-DOMAIN or OFF-TOPIC.\n"
                "- IN-DOMAIN: Government schemes, agriculture, farming, crops, seed subsidy, irrigation, tractor subsidy, fertilizers, rural welfare, scheme eligibility, application steps, or agricultural support.\n"
                "- OFF-TOPIC: Sports, celebrities, entertainment, generic coding, casual banter, general global trivia, politics, non-agricultural queries.\n\n"
                "Output ONLY 'IN_DOMAIN' or 'OFF_TOPIC'."
            )),
            HumanMessage(content=f"User Query: {query}")
        ]
        
        decision = llm.invoke(eval_prompt).content.strip().upper()

        if "OFF_TOPIC" in decision:
            if target_lang == "ta":
                return "OFF_TOPIC", (
                    "⚠️ **பாதுகாப்பு வழிகாட்டுதல் (NeMo Guardrail):**\n"
                    "நான் தமிழ்நாடு அரசு வேளாண் திட்டங்கள், விவசாய நலத்திட்டங்கள் மற்றும் மானியங்கள் தொடர்பான தகவல்களை வழங்க மட்டுமே வடிவமைக்கப்பட்டுள்ளேன்.\n\n"
                    "தயவுசெய்து விதை மானியம், பயிர் காப்பீடு அல்லது வேளாண் சலுகைகள் தொடர்பான கேள்விகளைக் கேளுங்கள்."
                )
            else:
                return "OFF_TOPIC", (
                    "⚠️ **NeMo Guardrails Policy Violation:**\n"
                    "I am strictly configured to assist with Tamil Nadu agricultural schemes, farmer welfare programs, and subsidies.\n\n"
                    "Please ask a question related to agricultural schemes, subsidies, eligibility, or application procedures."
                )

    return "ALLOWED", ""
