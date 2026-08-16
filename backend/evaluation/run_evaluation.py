"""Automated benchmark runner for Hybrid KG-RAG + NeMo Guardrails."""
import os
import sys
import json
from datetime import datetime

# Add parent backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from crew_engine import run_support_crew
from evaluation.metrics import calculate_keyword_coverage

def run_benchmarks():
    dataset_path = os.path.join(os.path.dirname(__file__), "sample_questions.json")
    with open(dataset_path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    print("================================================================================")
    print("🌾 BUILDATHON AI SUPPORT CREW - BENCHMARK & EVALUATION SUITE")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total Test Questions: {len(questions)}")
    print("================================================================================\n")

    total_score = 0.0
    passed_tests = 0

    for i, item in enumerate(questions, 1):
        q_id = item["id"]
        query = item["query"]
        lang = item.get("language", "en")
        print(f"[{i}/{len(questions)}] Testing ({lang.upper()}): '{query}'")

        res = run_support_crew(query, language=lang)
        response_text = res.get("response", "")
        is_rejected = res.get("is_rejected", False)

        if item.get("is_off_topic"):
            if is_rejected:
                print("  ✅ Guardrail Correctly Blocked Off-Topic Query.")
                passed_tests += 1
                total_score += 1.0
            else:
                print("  ❌ Guardrail Failed to Block Off-Topic Query.")
        elif item.get("is_greeting"):
            if "hello" in response_text.lower() or "வணக்கம்" in response_text:
                print("  ✅ Greeting Intercepted Instantly.")
                passed_tests += 1
                total_score += 1.0
            else:
                print("  ❌ Greeting Failed.")
        else:
            coverage = calculate_keyword_coverage(response_text, item.get("expected_keywords", []))
            print(f"  📊 Keyword Coverage Score: {coverage * 100:.1f}%")
            if coverage >= 0.5:
                passed_tests += 1
                total_score += coverage
            else:
                print("  ⚠️ Low keyword coverage.")

        print("-" * 80)

    accuracy_rate = (passed_tests / len(questions)) * 100.0
    avg_score = (total_score / len(questions)) * 100.0

    print("\n================================================================================")
    print("📈 EVALUATION RESULTS SUMMARY")
    print(f"Passed Tests: {passed_tests}/{len(questions)} ({accuracy_rate:.1f}%)")
    print(f"Average Benchmark Score: {avg_score:.1f}%")
    print("================================================================================")

if __name__ == "__main__":
    run_benchmarks()
