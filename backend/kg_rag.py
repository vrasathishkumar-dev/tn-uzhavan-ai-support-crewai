import os
import csv
import re
import math
import json
import networkx as nx
from typing import Dict, Any, Tuple, Optional, List
from collections import Counter

# Global in-memory caches
_GRAPH_EN: Optional[nx.DiGraph] = None
_SCHEMES_EN: Optional[Dict[str, Dict[str, Any]]] = None
_BM25_EN: Optional["BM25Index"] = None

_GRAPH_TA: Optional[nx.DiGraph] = None
_SCHEMES_TA: Optional[Dict[str, Dict[str, Any]]] = None
_BM25_TA: Optional["BM25Index"] = None


def is_tamil_text(text: str) -> bool:
    """Detects if text contains Tamil Unicode characters (U+0B80 to U+0BFF)."""
    return bool(re.search(r'[\u0B80-\u0BFF]', text))


def clean_text(text: str) -> str:
    """Cleans HTML tags and extra spaces from text."""
    if not text:
        return ""
    cleaned = re.sub(r'<[^>]+>', ' ', text)
    cleaned = cleaned.replace('&quot;', '"').replace('&amp;', '&').replace('&#39;', "'")
    return re.sub(r'\s+', ' ', cleaned).strip()


def tokenize(text: str) -> List[str]:
    """Tokenizes text into meaningful lowercase word tokens (English & Tamil)."""
    words = re.findall(r'\b[a-zA-Z0-9_\u0B80-\u0BFF]{2,}\b', text.lower())
    stop_words = {
        "the", "and", "for", "with", "from", "that", "this", "what", "how", "when", 
        "where", "which", "are", "you", "can", "get", "apply", "scheme", "schemes",
        "திட்டம்", "விண்ணப்பிப்பது", "எப்படி", "மற்றும்", "என்ன", "ஒரு", "இல்"
    }
    return [w for w in words if w not in stop_words]


def extract_entities_from_text(text: str) -> List[str]:
    """Extracts significant keywords and entity tokens from text."""
    return tokenize(text)


# ---------------------------------------------------------------------------
# Okapi BM25 Indexer & Re-Ranking Engine
# ---------------------------------------------------------------------------
class BM25Index:
    """
    Okapi BM25 statistical scoring implementation for lexical search & re-ranking:
    Score(D, Q) = sum_i IDF(q_i) * (f(q_i, D) * (k1 + 1)) / (f(q_i, D) + k1 * (1 - b + b * (|D| / avgdl)))
    """
    def __init__(self, corpus: Dict[str, str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.doc_ids = list(corpus.keys())
        self.doc_lengths: Dict[str, int] = {}
        self.doc_freqs: Dict[str, int] = Counter()
        self.term_freqs: Dict[str, Dict[str, int]] = {}
        self.idf: Dict[str, float] = {}

        total_length = 0
        for doc_id, text in corpus.items():
            tokens = tokenize(text)
            self.doc_lengths[doc_id] = len(tokens)
            total_length += len(tokens)
            tf = Counter(tokens)
            self.term_freqs[doc_id] = tf
            for term in tf.keys():
                self.doc_freqs[term] += 1

        self.num_docs = len(self.doc_ids)
        self.avgdl = (total_length / self.num_docs) if self.num_docs > 0 else 1.0

        # Calculate standard smoothed IDF for all vocabulary terms
        for term, freq in self.doc_freqs.items():
            self.idf[term] = math.log(1.0 + (self.num_docs - freq + 0.5) / (freq + 0.5))

    def score(self, query_tokens: List[str], doc_id: str) -> float:
        """Calculates BM25 score for a given document and query tokens."""
        if doc_id not in self.term_freqs:
            return 0.0

        tf_dict = self.term_freqs[doc_id]
        doc_len = self.doc_lengths.get(doc_id, 0)
        score = 0.0

        for q in query_tokens:
            if q not in tf_dict:
                continue
            tf = tf_dict[q]
            idf = self.idf.get(q, 0.0)
            numerator = tf * (self.k1 + 1.0)
            denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avgdl))
            score += idf * (numerator / denominator)

        return score

    def rank(self, query: str, top_k: int = 10) -> List[Tuple[str, float]]:
        """Ranks all documents in the corpus using BM25 scoring."""
        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        scores: List[Tuple[str, float]] = []
        for doc_id in self.doc_ids:
            s = self.score(query_tokens, doc_id)
            if s > 0.0:
                scores.append((doc_id, s))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]


def build_and_save_graph_store(csv_file_path: str, graph_json_path: str, lang: str = "en") -> Tuple[nx.DiGraph, Dict[str, Dict[str, Any]], BM25Index]:
    """
    Constructs the NetworkX Knowledge Graph and Okapi BM25 Index from CSV data,
    saves the physical graph to graph_storage, and returns all structures.
    """
    graph = nx.DiGraph()
    schemes: Dict[str, Dict[str, Any]] = {}
    corpus: Dict[str, str] = {}

    if not os.path.exists(csv_file_path):
        print(f"Warning: {csv_file_path} not found.")
        return graph, schemes, BM25Index({})

    with open(csv_file_path, mode="r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            slug = row.get("Slug", "").strip().lower()
            scheme_name = row.get("Scheme Name", "").strip()
            if not slug or not scheme_name:
                continue

            scheme_data = {
                "slug": slug,
                "name": scheme_name,
                "short_title": row.get("Short Title", "").strip(),
                "level": row.get("Level", "").strip(),
                "state": row.get("State/UT", "").strip() or "Tamil Nadu",
                "categories": [c.strip() for c in row.get("Categories", "").split(",") if c.strip()],
                "tags": [t.strip() for t in row.get("Tags", "").split(",") if t.strip()],
                "ministry": row.get("Nodal Ministry", "").strip(),
                "scheme_for": row.get("Scheme For", "").strip(),
                "url": row.get("URL", "").strip(),
                "description": clean_text(row.get("Brief Description", "")),
                "benefits": clean_text(row.get("Benefits", "")),
                "eligibility": clean_text(row.get("Eligibility", "")),
                "application_process": clean_text(row.get("Application Process", "")),
                "documents_required": clean_text(row.get("Documents Required", "")),
            }
            schemes[slug] = scheme_data

            # Build full text document representation for BM25 ranking
            doc_text = f"{scheme_name} {scheme_data['short_title']} {' '.join(scheme_data['categories'])} {' '.join(scheme_data['tags'])} {scheme_data['benefits']} {scheme_data['eligibility']} {scheme_data['application_process']}"
            corpus[slug] = doc_text

            # 1. Scheme Node
            graph.add_node(slug, entity_type="Scheme", name=scheme_name, lang=lang)

            # 2. Category Nodes & Relationships: (Scheme)-[BELONGS_TO]->(Category)
            for cat in scheme_data["categories"]:
                cat_node = f"cat_{cat.lower().replace(' ', '_')}"
                graph.add_node(cat_node, entity_type="Category", name=cat)
                graph.add_edge(slug, cat_node, relation="BELONGS_TO")

            # 3. Tag Nodes & Relationships: (Scheme)-[HAS_TAG]->(Tag)
            for tag in scheme_data["tags"]:
                tag_node = f"tag_{tag.lower().replace(' ', '_')}"
                graph.add_node(tag_node, entity_type="Tag", name=tag)
                graph.add_edge(slug, tag_node, relation="HAS_TAG")

    # Ensure the parent graph_storage folder exists
    os.makedirs(os.path.dirname(graph_json_path), exist_ok=True)

    # Save physical graph file to graph_storage
    graph_data = {
        "graph": nx.node_link_data(graph),
        "schemes": schemes
    }
    with open(graph_json_path, "w", encoding="utf-8") as f:
        json.dump(graph_data, f, ensure_ascii=False, indent=2)

    bm25_index = BM25Index(corpus)
    print(f"[{lang.upper()}] Graph Storage & BM25 Index ready: {graph.number_of_nodes()} Nodes, {graph.number_of_edges()} Edges, {len(corpus)} Documents")
    return graph, schemes, bm25_index


def load_graph_store(graph_json_path: str) -> Tuple[nx.DiGraph, Dict[str, Dict[str, Any]], BM25Index]:
    """Loads the Knowledge Graph and initializes BM25 index from JSON storage."""
    with open(graph_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    graph = nx.node_link_graph(data["graph"])
    schemes = data["schemes"]

    # Reconstruct BM25 index from schemes text
    corpus = {}
    for slug, s in schemes.items():
        corpus[slug] = f"{s['name']} {s.get('short_title', '')} {' '.join(s.get('categories', []))} {' '.join(s.get('tags', []))} {s.get('benefits', '')} {s.get('eligibility', '')} {s.get('application_process', '')}"

    bm25 = BM25Index(corpus)
    return graph, schemes, bm25


def get_or_load_graphs():
    """Loads or creates the English and Tamil Knowledge Graphs + BM25 Indexes."""
    global _GRAPH_EN, _SCHEMES_EN, _BM25_EN, _GRAPH_TA, _SCHEMES_TA, _BM25_TA
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    graph_storage_dir = os.path.join(base_dir, "graph_storage")
    os.makedirs(graph_storage_dir, exist_ok=True)

    en_json = os.path.join(graph_storage_dir, "knowledge_graph_en.json")
    ta_json = os.path.join(graph_storage_dir, "knowledge_graph_ta.json")

    # Load or build English graph & BM25
    if _GRAPH_EN is None or _BM25_EN is None:
        if os.path.exists(en_json):
            _GRAPH_EN, _SCHEMES_EN, _BM25_EN = load_graph_store(en_json)
        else:
            _GRAPH_EN, _SCHEMES_EN, _BM25_EN = build_and_save_graph_store(
                os.path.join(data_dir, "schemes_en.csv"), en_json, lang="en"
            )

    # Load or build Tamil graph & BM25
    if _GRAPH_TA is None or _BM25_TA is None:
        if os.path.exists(ta_json):
            _GRAPH_TA, _SCHEMES_TA, _BM25_TA = load_graph_store(ta_json)
        else:
            _GRAPH_TA, _SCHEMES_TA, _BM25_TA = build_and_save_graph_store(
                os.path.join(data_dir, "schemes_ta.csv"), ta_json, lang="ta"
            )

    return (_GRAPH_EN, _SCHEMES_EN, _BM25_EN), (_GRAPH_TA, _SCHEMES_TA, _BM25_TA)


def query_knowledge_graph(query: str, lang: Optional[str] = None, top_k: int = 2) -> Tuple[bool, str]:
    """
    Hybrid Search Engine:
    1. Knowledge Graph Entity Traversal: Identifies candidate subgraphs & structural scores.
    2. Okapi BM25 Re-Ranker: Computes statistical relevance across document corpus.
    3. Hybrid Ranker: Combines Graph Traversal Score + BM25 Score for superior ranking.
    """
    (graph_en, schemes_en, bm25_en), (graph_ta, schemes_ta, bm25_ta) = get_or_load_graphs()

    if lang is None:
        lang = "ta" if is_tamil_text(query) else "en"

    graph = graph_ta if lang == "ta" else graph_en
    schemes = schemes_ta if lang == "ta" else schemes_en
    bm25 = bm25_ta if lang == "ta" else bm25_en

    if not schemes and schemes_en:
        graph = graph_en
        schemes = schemes_en
        bm25 = bm25_en
        lang = "en"

    query_lower = query.lower()
    query_entities = extract_entities_from_text(query)

    # Step 1: Knowledge Graph Structural Traversal Scoring
    graph_scores: Dict[str, float] = {}

    for slug, data in schemes.items():
        score = 0.0
        name_lower = data["name"].lower()
        title_lower = data["short_title"].lower()

        if name_lower in query_lower or (title_lower and title_lower in query_lower):
            score += 20.0

        for entity in query_entities:
            if entity in name_lower or (title_lower and entity in title_lower):
                score += 5.0

        for tag in data.get("tags", []):
            if tag.lower() in query_lower or any(e in tag.lower() for e in query_entities):
                score += 4.0

        for cat in data.get("categories", []):
            if cat.lower() in query_lower or any(e in cat.lower() for e in query_entities):
                score += 3.0

        if score > 0:
            graph_scores[slug] = score

    # Step 2: Okapi BM25 Lexical Scoring for all schemes
    bm25_ranked = bm25.rank(query, top_k=20)
    bm25_score_map = {slug: s for slug, s in bm25_ranked}

    # Step 3: Hybrid Fusion (Graph Structure + BM25 Statistical Rank)
    all_candidate_slugs = set(graph_scores.keys()).union(set(bm25_score_map.keys()))
    
    if not all_candidate_slugs and lang == "ta" and schemes_en:
        return query_knowledge_graph(query, lang="en", top_k=top_k)

    hybrid_scores: Dict[str, float] = {}
    for slug in all_candidate_slugs:
        g_score = graph_scores.get(slug, 0.0)
        b_score = bm25_score_map.get(slug, 0.0)
        # Weighting: 40% Graph Structural match + 60% BM25 statistical relevance
        hybrid_scores[slug] = (0.4 * g_score) + (0.6 * b_score * 3.0)

    # Sort candidates by combined hybrid rank
    ranked_slugs = [s for s, sc in sorted(hybrid_scores.items(), key=lambda x: x[1], reverse=True) if sc >= 2.0]

    if not ranked_slugs:
        return False, "No matching schemes found in the Knowledge Graph for this query."

    results = []
    for i, slug in enumerate(ranked_slugs[:top_k], 1):
        data = schemes[slug]
        categories = [
            graph.nodes[target]["name"]
            for _, target, edge in graph.out_edges(slug, data=True)
            if edge.get("relation") == "BELONGS_TO"
        ]

        text_block = f"""
### [Knowledge Graph Scheme {i}: {data['name']}]
- **Categories:** {', '.join(categories)}
- **State:** {data['state']} | **Target:** {data['scheme_for']}
- **Benefits:** {data['benefits']}
- **Eligibility:** {data['eligibility']}
- **Application Steps:** {data['application_process']}
- **Required Documents:** {data['documents_required']}
- **Official Portal Link:** {data['url']}
- **BM25 & Graph Relevance Score:** {hybrid_scores[slug]:.2f}
"""
        results.append(text_block.strip())

    return True, "\n\n---\n\n".join(results)


# Standalone test runner
if __name__ == "__main__":
    print("Testing Hybrid Search (Knowledge Graph + Okapi BM25 Re-Ranking)...\n")
    (g_en, s_en, b_en), (g_ta, s_ta, b_ta) = get_or_load_graphs()
    
    print("1. English Query with BM25 Re-Ranking:")
    found_en, res_en = query_knowledge_graph("seed subsidy for farmers in Tamil Nadu", lang="en")
    print(res_en)

    print("\n" + "="*80)
    print("2. Tamil Query with BM25 Re-Ranking:")
    found_ta, res_ta = query_knowledge_graph("சான்றளிக்கப்பட்ட விதை மானியம் பெறுவது எப்படி?", lang="ta")
    print(res_ta)
