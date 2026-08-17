import os
import re
import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

# Default database location inside graph_storage (persisted across Docker volumes)
DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "graph_storage")
DB_PATH = os.path.join(DB_DIR, "long_term_memory.db")


class PersistentSQLiteMemory:
    """
    Advanced Custom Persistent SQLite Storage for Long-Term Memory (LTM).
    Persists multi-agent Q&A history, entity extraction, farmer profiles,
    and cross-session insights in SQLite.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_tables()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        """Initializes SQLite schema for Long-Term Memory, Entity Memory, Farmer Profiles, and Unanswered Queries."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Long-Term Interaction & Resolution Memory
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS long_term_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    query TEXT NOT NULL,
                    assistant_context TEXT,
                    web_context TEXT,
                    final_answer TEXT NOT NULL,
                    language TEXT DEFAULT 'en',
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 2. Entity Memory (Remembering specific schemes, crops, districts mentioned)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS entity_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_name TEXT NOT NULL UNIQUE,
                    entity_type TEXT NOT NULL,
                    attributes_json TEXT,
                    frequency INTEGER DEFAULT 1,
                    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 3. Farmer User Memory (Remembering user preferences & farmland details across sessions)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS farmer_profiles (
                    session_id TEXT PRIMARY KEY,
                    farmer_name TEXT,
                    district TEXT,
                    land_type TEXT,
                    crop_details TEXT,
                    preferred_language TEXT DEFAULT 'ta',
                    notes TEXT,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 4. Unanswered / Flagged Queries for Admin Dashboard
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS unanswered_queries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    query TEXT NOT NULL,
                    response TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'PENDING'
                );
            """)

            # Create search indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_query ON long_term_memories(query);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_session ON long_term_memories(session_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_unanswered_status ON unanswered_queries(status);")
            conn.commit()

    def save_interaction(
        self,
        session_id: str,
        query: str,
        assistant_context: str,
        web_context: str,
        final_answer: str,
        language: str = "en"
    ) -> int:
        """Stores a resolved interaction in Long-Term Memory and extracts entities."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO long_term_memories 
                (session_id, query, assistant_context, web_context, final_answer, language)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (session_id, query, assistant_context, web_context, final_answer, language)
            )
            memory_id = cursor.lastrowid
            conn.commit()

        # Extract and persist mentioned agricultural entities
        self.extract_and_save_entities(query, final_answer)
        return memory_id

    def recall_relevant_memories(self, query: str, limit: int = 2) -> List[Dict[str, Any]]:
        """
        Recalls relevant past resolutions from Long-Term Memory matching key terms in the query.
        """
        keywords = [k.strip() for k in query.split() if len(k.strip()) > 3]
        if not keywords:
            return []

        # Build SQL search clause with keywords
        conditions = " OR ".join(["query LIKE ?" for _ in keywords[:4]])
        params = [f"%{kw}%" for kw in keywords[:4]]

        with self._get_connection() as conn:
            cursor = conn.cursor()
            sql = f"""
                SELECT id, session_id, query, final_answer, timestamp 
                FROM long_term_memories 
                WHERE {conditions}
                ORDER BY id DESC 
                LIMIT ?
            """
            cursor.execute(sql, (*params, limit))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def log_unanswered_query(self, session_id: str, query: str, response: str, status: str = "PENDING") -> int:
        """Logs an unanswered or guardrail-flagged query for admin dashboard."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO unanswered_queries (session_id, query, response, status)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, query, response, status)
            )
            qid = cursor.lastrowid
            conn.commit()
            return qid

    def get_unanswered_queries(self) -> List[Dict[str, Any]]:
        """Retrieves all unanswered / flagged queries for admin review."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, query, response, timestamp, status FROM unanswered_queries ORDER BY id DESC LIMIT 100")
            return [dict(row) for row in cursor.fetchall()]

    def update_unanswered_query_status(self, query_id: int, status: str) -> bool:
        """Updates the status of an unanswered query (e.g. RESOLVED, IGNORED, PENDING)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE unanswered_queries SET status = ? WHERE id = ?", (status, query_id))
            conn.commit()
            return cursor.rowcount > 0

    def get_system_stats(self, total_schemes: int) -> Dict[str, Any]:
        """Calculates live analytics for the admin dashboard."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Count total queries
            cursor.execute("SELECT COUNT(*) FROM long_term_memories")
            total_interactions = cursor.fetchone()[0]

            # Count distinct active sessions
            cursor.execute("SELECT COUNT(DISTINCT session_id) FROM long_term_memories")
            active_sessions = max(1, cursor.fetchone()[0])

            # Count unanswered queries by status
            cursor.execute("SELECT COUNT(*) FROM unanswered_queries")
            total_unanswered = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM unanswered_queries WHERE status = 'PENDING'")
            pending = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM unanswered_queries WHERE status = 'RESOLVED'")
            resolved = cursor.fetchone()[0]

            return {
                "total_schemes": total_schemes,
                "total_interactions": total_interactions,
                "total_unanswered_queries": total_unanswered,
                "pending_queries": pending,
                "resolved_queries": resolved,
                "active_sessions": active_sessions
            }

    def extract_and_save_entities(self, query: str, answer: str):
        """Extracts significant keywords (crops, districts, schemes) and tracks their frequency in SQLite."""
        text = f"{query} {answer}".lower()
        
        # Known Tamil Nadu agricultural domains
        crop_patterns = ["paddy", "rice", "sugarcane", "cotton", "millets", "banana", "pulses", "நெல்", "கரும்பு", "பருத்தி", "வாழை"]
        district_patterns = ["thanjavur", "madurai", "coimbatore", "trichy", "salem", "tirunelveli", "தஞ்சாவூர்", "மதுரை", "கோவை"]
        tech_patterns = ["drip irrigation", "solar pump", "organic fertilizer", "subsidy", "சொட்டு நீர்", "சூரிய மின் பம்பு", "மானியம்"]

        entities_to_save = []
        for c in crop_patterns:
            if c in text:
                entities_to_save.append((c.title(), "Crop"))
        for d in district_patterns:
            if d in text:
                entities_to_save.append((d.title(), "District"))
        for t in tech_patterns:
            if t in text:
                entities_to_save.append((t.title(), "Technology / Scheme"))

        if not entities_to_save:
            return

        with self._get_connection() as conn:
            cursor = conn.cursor()
            for name, etype in entities_to_save:
                cursor.execute("""
                    INSERT INTO entity_memories (entity_name, entity_type, frequency, last_seen)
                    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
                    ON CONFLICT(entity_name) DO UPDATE SET
                        frequency = frequency + 1,
                        last_seen = CURRENT_TIMESTAMP
                """, (name, etype))
            conn.commit()

    def update_farmer_profile(
        self,
        session_id: str,
        farmer_name: Optional[str] = None,
        district: Optional[str] = None,
        land_type: Optional[str] = None,
        crop_details: Optional[str] = None,
        preferred_language: Optional[str] = None,
        notes: Optional[str] = None
    ):
        """Updates or registers a persistent farmer profile."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO farmer_profiles (session_id, farmer_name, district, land_type, crop_details, preferred_language, notes, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(session_id) DO UPDATE SET
                    farmer_name=COALESCE(?, farmer_name),
                    district=COALESCE(?, district),
                    land_type=COALESCE(?, land_type),
                    crop_details=COALESCE(?, crop_details),
                    preferred_language=COALESCE(?, preferred_language),
                    notes=COALESCE(?, notes),
                    last_updated=CURRENT_TIMESTAMP
                """,
                (
                    session_id, farmer_name, district, land_type, crop_details, preferred_language, notes,
                    farmer_name, district, land_type, crop_details, preferred_language, notes
                )
            )
            conn.commit()

    def get_farmer_profile(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves persistent farmer profile for a given session."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM farmer_profiles WHERE session_id = ?", (session_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_all_memories(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves recent long term memories for audit / dashboard."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM long_term_memories ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(row) for row in cursor.fetchall()]


# Global memory manager singleton instance
memory_db = PersistentSQLiteMemory()
