const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ChatRequest {
  session_id: string;
  message: string;
  language?: string;  // BCP-47 code: 'en', 'ta', 'hi', 'te', 'kn', 'ml'
}

export interface ChatResponse {
  status: string;
  response: string;
  is_rejected: boolean;
  language?: string;
}

export interface Scheme {
  scheme_name: string;
  short_title: string;
  slug: string;
  level: string;
  state: string;
  categories: string[];
  tags: string[];
  brief_description: string;
  benefits: string;
  eligibility: string;
  exclusions: string;
  application_process: string;
  documents_required: string;
  faqs?: string;
  sources?: string;
  url: string;
}

export interface SchemesResponse {
  total: number;
  limit: number;
  offset: number;
  schemes: Scheme[];
}

export interface UnansweredQuery {
  id: number;
  query: string;
  response: string;
  timestamp: string;
  status: "PENDING" | "RESOLVED" | "IGNORED";
}

export interface SystemStats {
  total_schemes: number;
  total_unanswered_queries: number;
  pending_queries: number;
  resolved_queries: number;
  active_sessions: number;
}

export async function sendChatMessage(
  sessionId: string,
  message: string,
  language: string = "en"
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message, language }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to communicate with AI server");
  }
  return res.json();
}

export interface ChatHistoryPayloadItem {
  role: string;
  text: string;
}

export async function sendChatMessageStream(
  sessionId: string,
  message: string,
  language: string = "en",
  chatHistory: ChatHistoryPayloadItem[] = [],
  onChunk: (chunk: string, isRejected?: boolean) => void,
  onDone?: () => void,
  onError?: (err: Error) => void
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message,
        language,
        chat_history: chatHistory,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to communicate with AI server");
    }

    if (!res.body) {
      throw new Error("No response body received from server");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.replace(/^data:\s*/, "");
          try {
            const data = JSON.parse(jsonStr);
            if (data.event === "done") {
              if (onDone) onDone();
              return;
            }
            if (data.event === "error") {
              if (onError) onError(new Error(data.error || "Streaming error"));
              return;
            }
            if (data.status === "rejected") {
              onChunk(data.response, true);
              if (onDone) onDone();
              return;
            }
            if (data.chunk) {
              onChunk(data.chunk, false);
            }
          } catch (e) {
            console.error("Failed to parse SSE payload", e);
          }
        }
      }
    }

    if (onDone) onDone();
  } catch (err: unknown) {
    if (onError) onError(err instanceof Error ? err : new Error(String(err)));
    else throw err;
  }
}

// In-memory client cache to prevent flickering / refetching on tab switching
const _schemesCache = new Map<string, SchemesResponse>();
const _categoriesCache = new Map<string, string[]>();

export function getCachedCategories(lang: string = "en"): string[] | undefined {
  return _categoriesCache.get(lang);
}

export function getCachedSchemes(lang: string = "en", category: string = "", search: string = ""): SchemesResponse | undefined {
  const cacheKey = `${lang}_${category}_${search}`;
  return _schemesCache.get(cacheKey);
}

export async function fetchSchemes(params?: { search?: string; category?: string; limit?: number; offset?: number; lang?: string }): Promise<SchemesResponse> {
  const lang = params?.lang || "en";
  const search = params?.search || "";
  const category = params?.category || "";
  const cacheKey = `${lang}_${category}_${search}`;

  if (!search && !category && _schemesCache.has(cacheKey)) {
    return _schemesCache.get(cacheKey)!;
  }

  const query = new URLSearchParams();
  if (params?.lang) query.append("lang", params.lang);
  if (params?.search) query.append("search", params.search);
  if (params?.category) query.append("category", params.category);
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.offset) query.append("offset", params.offset.toString());

  try {
    const res = await fetch(`${API_BASE_URL}/schemes?${query.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: SchemesResponse = await res.json();
    _schemesCache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.warn("fetchSchemes network error:", err);
    return { total: 0, limit: params?.limit || 20, offset: params?.offset || 0, schemes: [] };
  }
}

export async function fetchCategories(lang: string = "en"): Promise<string[]> {
  if (_categoriesCache.has(lang)) {
    return _categoriesCache.get(lang)!;
  }

  const query = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  try {
    const res = await fetch(`${API_BASE_URL}/schemes/categories${query}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cats: string[] = data.categories || [];
    _categoriesCache.set(lang, cats);
    return cats;
  } catch (err) {
    console.warn("fetchCategories network error:", err);
    return [];
  }
}

export async function fetchSchemeBySlug(slug: string, lang?: string): Promise<Scheme> {
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  const res = await fetch(`${API_BASE_URL}/schemes/detail/${encodeURIComponent(slug)}${query}`);
  if (!res.ok) throw new Error("Scheme not found");
  return res.json();
}

export function cleanHtmlText(raw: string | undefined | null): string {
  if (!raw) return "";
  let text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

  // 1. Normalize malformed double-star markdown bold syntax:
  // e.g. "* * text * *", "* *text * *", "* *text: * *" -> "**text**"
  text = text
    .replace(/\*\s+\*/g, "**")
    .replace(/\*\*\s+([^*]+?)\s+\*\*/g, "**$1**")
    .replace(/\*\*\s+([^*]+?)\*\*/g, "**$1**")
    .replace(/\*\*([^*]+?)\s+\*\*/g, "**$1**");

  // 2. Normalize single-star bold tags (common in Tamil/multilingual scheme datasets e.g. "* உதவியின் அளவு: *") -> "**உதவியின் அளவு:**"
  text = text.replace(/(?<!\*)\*(?!\*)[^\S\r\n]*([^\*\:\r\n]+?)[^\S\r\n]*\:[^\S\r\n]*\*(?!\*)/g, "**$1:**");
  text = text.replace(/(?<!\*)\*(?!\*)[^\S\r\n]*([^\*\:\r\n]+?)[^\S\r\n]*\*(?!\*)/g, (match, p1) => {
    return `**${p1.trim()}**`;
  });

  // 3. Fix squished bullet hyphens, step numbers, and inline bold labels by inserting newlines
  text = text
    .replace(/([^\n])\s*-\s*\*\*/g, "$1\n- **")
    .replace(/([^\n])\s+•\s*/g, "$1\n• ")
    .replace(/([^\n])\s+(\d+)[\.\)]\s*\*\*/g, "$1\n$2. **")
    .replace(/([^\n])\s*-\s*([\u0B80-\u0BFF\w\s]{2,25}\:)/g, "$1\n- **$2**");

  // 4. Ensure proper spacing around bullet hyphens and bold colons (e.g. "-**" -> "- **", "**மானியம்:**50%" -> "**மானியம்:** 50%")
  text = text.replace(/(^|\n)\s*-\s*\*\*/g, "$1- **");
  text = text.replace(/(^|\n)\s*-\s*([^\s\*])/g, "$1- $2");
  text = text.replace(/:\*\*([^\s\n\*])/g, ":** $1");

  text = text.replace(/[^\S\r\n]+/g, " ");
  text = text.replace(/\n\s+/g, "\n");

  return text.trim();
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function parseFaqs(faqText: string | undefined | null): FaqItem[] {
  if (!faqText) return [];
  const cleaned = cleanHtmlText(faqText);
  if (!cleaned) return [];

  const items: FaqItem[] = [];
  const rawBlocks = cleaned.split(/(?=(?:^|\n)Q[:\d\s])/i);

  for (const block of rawBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Look for A: or Answer:
    const aIndex = trimmed.search(/(?:^|\n)A[:\d\s]/i);
    if (aIndex !== -1) {
      const qPart = trimmed.substring(0, aIndex).replace(/^Q[:\d\s]*/i, "").trim();
      const aPart = trimmed.substring(aIndex).replace(/^(?:\n)?A[:\d\s]*/i, "").trim();
      if (qPart && aPart) {
        items.push({ question: qPart, answer: aPart });
        continue;
      }
    }

    const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      items.push({
        question: lines[0].replace(/^Q[:\d\s]*/i, "").trim(),
        answer: lines.slice(1).join("\n").replace(/^A[:\d\s]*/i, "").trim()
      });
    } else if (lines.length === 1) {
      items.push({
        question: "General Information",
        answer: lines[0]
      });
    }
  }

  return items;
}

export interface SourceItem {
  title: string;
  url: string;
}

export function parseSources(sourcesText?: string | null, fallbackUrl?: string): SourceItem[] {
  const items: SourceItem[] = [];

  if (sourcesText) {
    const cleaned = cleanHtmlText(sourcesText);
    if (cleaned) {
      // Match markdown links e.g. [Guidelines](https://...) or - [Guidelines](https://...)
      const mdRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = mdRegex.exec(cleaned)) !== null) {
        let url = match[2].trim();
        // Replace broken/outdated state portal links (tn.gov.in/scheme/data_view/) with verified official portal URL
        if (url.includes("tn.gov.in/scheme/data_view/") && fallbackUrl) {
          url = fallbackUrl;
        }
        items.push({
          title: match[1].trim(),
          url: url,
        });
      }

      // Fallback for raw URLs or text lines if no markdown links match
      if (items.length === 0) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const lines = cleaned.split("\n").map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const uMatch = line.match(urlRegex);
          if (uMatch) {
            let url = uMatch[0];
            if (url.includes("tn.gov.in/scheme/data_view/") && fallbackUrl) {
              url = fallbackUrl;
            }
            const title = line.replace(uMatch[0], "").replace(/^[-*\s]+/, "").replace(/[()]/g, "").trim() || "Reference Guidelines";
            items.push({ title, url });
          }
        }
      }
    }
  }

  // Always ensure official active portal link is included
  if (fallbackUrl && !items.some(i => i.url === fallbackUrl)) {
    items.unshift({ title: "Official Scheme Guidelines & Portal", url: fallbackUrl });
  }

  return items;
}

export async function fetchSystemStats(): Promise<SystemStats> {
  try {
    const res = await fetch(`${API_BASE_URL}/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("fetchSystemStats network error:", err);
    return {
      total_schemes: 0,
      total_unanswered_queries: 0,
      pending_queries: 0,
      resolved_queries: 0,
      active_sessions: 1,
    };
  }
}

export async function fetchUnansweredQueries(): Promise<UnansweredQuery[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/unanswered-queries`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.unanswered_queries || [];
  } catch (err) {
    console.warn("fetchUnansweredQueries network error:", err);
    return [];
  }
}

export async function updateQueryStatus(id: number, status: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/unanswered-queries/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn("updateQueryStatus network error:", err);
  }
}
