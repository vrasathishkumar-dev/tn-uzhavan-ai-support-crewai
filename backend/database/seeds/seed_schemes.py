"""Seed script to build Knowledge Graph stores from CSV datasets."""
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from kg_rag import get_or_load_graphs

def run_seed():
    print("Seeding Knowledge Graph from CSV files...")
    (g_en, s_en, b_en), (g_ta, s_ta, b_ta) = get_or_load_graphs()
    print(f"Seeded English Graph: {len(s_en)} schemes, {g_en.number_of_nodes()} entities")
    print(f"Seeded Tamil Graph: {len(s_ta)} schemes, {g_ta.number_of_nodes()} entities")
    print("Knowledge Graph Seeding Complete.")

if __name__ == "__main__":
    run_seed()
