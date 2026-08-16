"""Evaluation metrics for RAG retrieval and answer relevancy."""
from typing import List, Set, Union

SYNONYM_MAP = {
    "வேளாண் அலுவலகம்": ["வேளாண்", "வேளாண்மை", "அலுவலகம்", "விவசாய", "துறை"],
    "மானியம்": ["மானியம்", "நிதி உதவி", "உதவி"],
    "விதை": ["விதை", "விதைகள்", "சான்றளிக்கப்பட்ட"],
    "agricultural office": ["agricultural office", "agriculture office", "department of agriculture", "agricultural officer", "office"],
    "application": ["apply", "application", "form", "steps", "process", "offline", "online"],
    "subsidy": ["subsidy", "financial assistance", "assistance", "fund", "50%"],
    "seed": ["seed", "seeds", "oil seed", "certified"],
    "cost": ["cost", "price", "50%", "expense", "₹"],
    "transport": ["transport", "transportation", "ha", "hectare", "cost"],
    "hectare": ["ha", "hectare", "acre"],
    "gypsum": ["gypsum", "manure", "fertilizer"],
}

def calculate_precision_at_k(retrieved_slugs: List[str], ground_truth_slugs: Set[str], k: int = 2) -> float:
    """Calculates Precision@K for scheme retrieval."""
    if not retrieved_slugs or not ground_truth_slugs:
        return 0.0
    top_k = retrieved_slugs[:k]
    hits = sum(1 for s in top_k if s in ground_truth_slugs)
    return hits / min(k, len(top_k))

def calculate_recall_at_k(retrieved_slugs: List[str], ground_truth_slugs: Set[str], k: int = 2) -> float:
    """Calculates Recall@K for scheme retrieval."""
    if not retrieved_slugs or not ground_truth_slugs:
        return 0.0
    top_k = retrieved_slugs[:k]
    hits = sum(1 for s in top_k if s in ground_truth_slugs)
    return hits / len(ground_truth_slugs)

def calculate_keyword_coverage(answer_text: str, expected_keywords: List[str]) -> float:
    """Measures keyword presence in generated answer with synonym tolerance."""
    if not expected_keywords:
        return 1.0
    ans_lower = answer_text.lower()
    covered = 0

    for kw in expected_keywords:
        kw_lower = kw.lower()
        if kw_lower in ans_lower:
            covered += 1
        else:
            # Check synonyms
            synonyms = SYNONYM_MAP.get(kw, SYNONYM_MAP.get(kw_lower, []))
            if any(syn.lower() in ans_lower for syn in synonyms):
                covered += 1

    return covered / len(expected_keywords)
