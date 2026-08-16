"use client";

import { useState, useEffect, useRef, Suspense, useSyncExternalStore, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import {
  Mic,
  MicOff,
  AlertTriangle,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  ArrowUp,
  Copy,
  Check,
  MessageSquare,
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";
import { sendChatMessageStream } from "@/lib/api";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  isRejected?: boolean;
  timestamp: string;
}

interface SpeechRecognitionEvent {
  results: {
    [key: number]: {
      [key: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface CustomWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

function generateUniqueId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getCurrentTimeString(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Strip backend response prefixes like "🤖 AI Response:" from displayed text and normalize markdown bold tags
function cleanBotText(text: string): string {
  let cleaned = text
    .replace(/^[\u{1F916}\u{1F9BE}\u{1FAD6}]\s*(AI Response|Response|Answer|Bot)?:?\s*/u, "")
    .replace(/^(AI Response|Response|Answer|Bot):\s*/i, "")
    .trim();

  // 1. Normalize malformed double-star markdown bold tags e.g. "* * text * *", "* *text * *", "* *text: * *" -> "**text**"
  cleaned = cleaned
    .replace(/\*\s+\*/g, "**")
    .replace(/\*\*\s+([^*]+?)\s+\*\*/g, "**$1**")
    .replace(/\*\*\s+([^*]+?)\*\*/g, "**$1**")
    .replace(/\*\*([^*]+?)\s+\*\*/g, "**$1**");

  // 2. Normalize single-star bold tags (common in Tamil/multilingual LLM outputs e.g. "* உதவியின் அளவு: *") -> "**உதவியின் அளவு:**"
  cleaned = cleaned.replace(/(?<!\*)\*(?!\*)[^\S\r\n]*([^\*\:\r\n]+?)[^\S\r\n]*\:[^\S\r\n]*\*(?!\*)/g, "**$1:**");
  cleaned = cleaned.replace(/(?<!\*)\*(?!\*)[^\S\r\n]*([^\*\:\r\n]+?)[^\S\r\n]*\*(?!\*)/g, (match, p1) => {
    return `**${p1.trim()}**`;
  });

  // 3. Fix squished bullet hyphens, step numbers, and inline bold labels by inserting newlines
  cleaned = cleaned
    .replace(/([^\n])\s*-\s*\*\*/g, "$1\n- **")
    .replace(/([^\n])\s+•\s*/g, "$1\n• ")
    .replace(/([^\n])\s+(\d+)[\.\)]\s*\*\*/g, "$1\n$2. **")
    .replace(/([^\n])\s*-\s*([\u0B80-\u0BFF\w\s]{2,25}\:)/g, "$1\n- **$2**");

  // 4. Ensure proper spacing around bullet hyphens and bold colons (e.g. "-**" -> "- **", "**மானியம்:**50%" -> "**மானியம்:** 50%")
  cleaned = cleaned.replace(/(^|\n)\s*-\s*\*\*/g, "$1- **");
  cleaned = cleaned.replace(/(^|\n)\s*-\s*([^\s\*])/g, "$1- $2");
  cleaned = cleaned.replace(/:\*\*([^\s\n\*])/g, ":** $1");

  cleaned = cleaned.replace(/[^\S\r\n]+/g, " ");
  cleaned = cleaned.replace(/\n\s+/g, "\n");

  return cleaned.trim();
}

const INITIAL_BOT_MESSAGE: Message = {
  id: "welcome",
  sender: "bot",
  text: "welcome", // Will be resolved dynamically via t("chat.welcomeTitle") + t("chat.welcomeBody")
  timestamp: getCurrentTimeString(),
};

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function ChatPageContent() {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();
  const processedParamRef = useRef<string | null>(null);

  const [sessionId, setSessionId] = useState<string>("farmer_session_1");
  const [sessions, setSessions] = useState<string[]>(["farmer_session_1"]);
  const [sessionHistories, setSessionHistories] = useState<Record<string, Message[]>>({
    farmer_session_1: [INITIAL_BOT_MESSAGE],
  });

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const isMounted = useIsMounted();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMessages = useMemo(
    () => sessionHistories[sessionId] || [INITIAL_BOT_MESSAGE],
    [sessionHistories, sessionId]
  );

  const quickPrompts = [
    {
      title: t("prompts.oilSeedsTitle"),
      query: t("prompts.oilSeedsQuery"),
      icon: "🌱",
    },
    {
      title: t("prompts.pensionTitle"),
      query: t("prompts.pensionQuery"),
      icon: "🌾",
    },
    {
      title: t("prompts.bioFertilizerTitle"),
      query: t("prompts.bioFertilizerQuery"),
      icon: "🧪",
    },
    {
      title: t("prompts.seedsProductionTitle"),
      query: t("prompts.seedsProductionQuery"),
      icon: "📦",
    },
  ];


  // Helper to dynamically calculate session title from first user query
  const getSessionTitle = (msgs: Message[], fallbackTitle: string) => {
    const firstUserMsg = msgs.find((m) => m.sender === "user");
    if (!firstUserMsg) return fallbackTitle;
    const rawText = firstUserMsg.text.trim();
    const title = rawText.charAt(0).toUpperCase() + rawText.slice(1);
    return title.length > 25 ? title.slice(0, 25) + "..." : title;
  };

  const [isHydrated, setIsHydrated] = useState(false);

  // Load saved chat history from localStorage on mount
  useEffect(() => {
    const formattedTime = getCurrentTimeString();
    const defaultWelcome: Message = {
      ...INITIAL_BOT_MESSAGE,
      timestamp: formattedTime,
    };

    try {
      const savedSessions = localStorage.getItem("chat_sessions");
      const savedHistories = localStorage.getItem("chat_session_histories");
      const savedSessionId = localStorage.getItem("chat_session_id");

      if (savedSessions && savedHistories) {
        const parsedSessions = JSON.parse(savedSessions);
        const parsedHistories = JSON.parse(savedHistories);

        if (Array.isArray(parsedSessions) && parsedSessions.length > 0 && Object.keys(parsedHistories).length > 0) {
          setSessions(parsedSessions);
          setSessionHistories(parsedHistories);
          if (savedSessionId && parsedSessions.includes(savedSessionId)) {
            setSessionId(savedSessionId);
          } else {
            setSessionId(parsedSessions[0]);
          }
          setIsHydrated(true);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load chat history from localStorage", e);
    }

    // Fallback default state
    setSessionHistories({
      farmer_session_1: [defaultWelcome],
    });
    setIsHydrated(true);
  }, []);

  // Save chat session history to localStorage on state changes (only after hydration is complete)
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem("chat_sessions", JSON.stringify(sessions));
        localStorage.setItem("chat_session_histories", JSON.stringify(sessionHistories));
        localStorage.setItem("chat_session_id", sessionId);
      } catch (e) {
        console.error("Failed to save chat history to localStorage", e);
      }
    }
  }, [sessions, sessionHistories, sessionId, isHydrated]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const handleNewChat = useCallback(() => {
    const emptySession = sessions.find((s) => {
      const msgs = sessionHistories[s] || [];
      return msgs.filter((m) => m.sender === "user").length === 0;
    });

    if (emptySession) {
      setSessionId(emptySession);
      showToast(t("chat.newChatStarted"));
      return;
    }

    const newSessionId = `farmer_session_${generateUniqueId()}`;
    const newWelcomeMessage: Message = {
      id: "welcome",
      sender: "bot",
      text: "welcome",
      timestamp: getCurrentTimeString(),
    };

    setSessions((prev) => [newSessionId, ...prev]);
    setSessionHistories((prev) => ({
      ...prev,
      [newSessionId]: [newWelcomeMessage],
    }));
    setSessionId(newSessionId);
    showToast(t("chat.newChatStarted"));
  }, [sessions, sessionHistories, showToast, t]);

  // Handle incoming URL parameters (e.g. ?new=true or ?query=...)
  useEffect(() => {
    if (!isHydrated) return;
    const queryParam = searchParams.get("query");
    const newParam = searchParams.get("new");

    if (!queryParam && !newParam) return;
    const paramKey = `${newParam}_${queryParam}`;
    if (processedParamRef.current === paramKey) return;
    processedParamRef.current = paramKey;

    queueMicrotask(() => {
      if (newParam === "true") {
        handleNewChat();
      } else if (queryParam) {
        const currentMsgs = sessionHistories[sessionId] || [];
        const currentHasUserMsg = currentMsgs.some((m) => m.sender === "user");

        if (currentHasUserMsg) {
          const emptySession = sessions.find((s) => {
            const msgs = sessionHistories[s] || [];
            return msgs.filter((m) => m.sender === "user").length === 0;
          });

          if (emptySession) {
            setSessionId(emptySession);
          } else {
            const newSessionId = `farmer_session_${generateUniqueId()}`;
            const formattedTime = getCurrentTimeString();
            const newWelcomeMessage: Message = {
              id: "welcome",
              sender: "bot",
              text: "welcome",
              timestamp: formattedTime,
            };
            setSessions((prev) => [newSessionId, ...prev]);
            setSessionHistories((prev) => ({
              ...prev,
              [newSessionId]: [newWelcomeMessage],
            }));
            setSessionId(newSessionId);
          }
        }
        setInput(queryParam);
        setTimeout(() => textareaRef.current?.focus(), 150);
      }
    });
  }, [searchParams, isHydrated, sessions, sessionHistories, sessionId, handleNewChat]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages, isLoading]);

  // Toast message auto-dismiss
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Setup Web Speech API for voice dictation if supported
  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as unknown as CustomWindow;
      if ("SpeechRecognition" in win || "webkitSpeechRecognition" in win) {
        const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
        if (SpeechRecognitionClass) {
          const rec = new SpeechRecognitionClass();
          rec.continuous = false;
          rec.interimResults = false;
          rec.lang = "en-IN";

          rec.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = event.results[0][0].transcript;
            setInput(transcript);
            setIsListening(false);
          };

          rec.onerror = () => {
            setIsListening(false);
          };

          rec.onend = () => {
            setIsListening(false);
          };

          recognitionRef.current = rec;
        }
      }
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      showToast("Voice speech recognition is not supported in this browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const handleCopyText = (msgId: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  };

  const handleSend = async (textToSend?: string, overrideSessionId?: string) => {
    const targetSession = overrideSessionId || sessionId;
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMsg: Message = {
      id: generateUniqueId(),
      sender: "user",
      text: query,
      timestamp: getCurrentTimeString(),
    };

    const botMsgId = generateUniqueId();
    const botMsgPlaceholder: Message = {
      id: botMsgId,
      sender: "bot",
      text: "",
      timestamp: getCurrentTimeString(),
    };

    // Update current session history with user message AND placeholder bot message
    setSessionHistories((prev) => ({
      ...prev,
      [targetSession]: [...(prev[targetSession] || []), userMsg, botMsgPlaceholder],
    }));

    const historyToSend = (sessionHistories[targetSession] || [])
      .filter((m) => m.id !== "welcome" && !m.isRejected && m.text.trim().length > 0)
      .map((m) => ({ role: m.sender, text: m.text }));

    if (!textToSend) setInput("");
    setIsLoading(true);

    try {
      await sendChatMessageStream(
        targetSession,
        query,
        i18n.language,
        historyToSend,
        (chunk: string, isRejected?: boolean) => {
          setSessionHistories((prev) => {
            const currentList = prev[targetSession] || [];
            const updated = currentList.map((m) => {
              if (m.id === botMsgId) {
                return {
                  ...m,
                  text: isRejected ? chunk : m.text + chunk,
                  isRejected: isRejected || m.isRejected,
                };
              }
              return m;
            });
            return {
              ...prev,
              [targetSession]: updated,
            };
          });
        },
        () => {
          setIsLoading(false);
        },
        () => {
          setSessionHistories((prev) => {
            const currentList = prev[targetSession] || [];
            const updated = currentList.map((m) => {
              if (m.id === botMsgId) {
                return {
                  ...m,
                  text: m.text || `⚠️ **Error**: Unable to reach backend.`,
                  isRejected: true,
                };
              }
              return m;
            });
            return { ...prev, [targetSession]: updated };
          });
          setIsLoading(false);
        }
      );
    } catch {
      setSessionHistories((prev) => {
        const currentList = prev[targetSession] || [];
        const updated = currentList.map((m) => {
          if (m.id === botMsgId) {
            return {
              ...m,
              text: m.text || `⚠️ **Error**: Unable to reach backend.`,
              isRejected: true,
            };
          }
          return m;
        });
        return { ...prev, [targetSession]: updated };
      });
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    const clearedMsg: Message = {
      id: generateUniqueId(),
      sender: "bot",
      text: t("chat.newChatStarted"),
      timestamp: getCurrentTimeString(),
    };
    setSessionHistories((prev) => ({
      ...prev,
      [sessionId]: [clearedMsg],
    }));
    showToast(t("chat.historyCleared"));
  };

  return (
    <div className="flex-1 flex min-h-0 relative overflow-hidden bg-slate-50 dark:bg-slate-950">
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-xl border border-emerald-500/30 flex items-center gap-2 text-xs font-medium animate-in fade-in slide-in-from-top-3 duration-200">
          <Sparkles className="w-4 h-4 text-emerald-300 animate-spin" />
          <span>{toastMessage.replace(/\*\*/g, "")}</span>
        </div>
      )}

      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-30 transition-opacity"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-slate-100/95 dark:bg-slate-900/95 md:bg-slate-100/80 md:dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-4 backdrop-blur-md transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="md:hidden flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <span className="font-semibold text-xs text-slate-700 dark:text-slate-300">{t("chat.activeSessions")}</span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={() => { handleNewChat(); setIsSidebarOpen(false); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium text-sm shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{t("chat.newChatSession")}</span>
        </button>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
          <label className="text-xs uppercase font-semibold tracking-wider text-slate-500 dark:text-slate-400 px-2">
            {t("chat.activeSessions")} ({sessions.length})
          </label>
          <div className="space-y-1 mt-1">
            {sessions.map((s) => {
              const msgs = sessionHistories[s] || [];
              const hasUserMessage = msgs.some((m) => m.sender === "user");
              const displayTitle = getSessionTitle(msgs, t("chat.newChat"));

              return (
                <button
                  key={s}
                  onClick={() => { setSessionId(s); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all text-left group ${
                    sessionId === s
                      ? "bg-white text-emerald-700 border border-emerald-500/40 shadow-sm font-semibold dark:bg-slate-800 dark:text-emerald-400 dark:border-emerald-500/30"
                      : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                  }`}
                >
                  <div className="truncate flex items-center gap-2.5 min-w-0 pr-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${hasUserMessage ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="truncate text-xs" title={displayTitle}>{displayTitle}</span>
                  </div>
                  {sessionId === s && <ChevronRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          <button
            onClick={handleClearHistory}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:text-red-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-slate-800/40 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t("chat.clearCurrentChat")}</span>
          </button>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/40 dark:text-emerald-300/80 text-[11px] leading-relaxed">
            🌿 <strong>{t("chat.verifiedDataTitle")}</strong> {t("chat.verifiedDataDesc")}
          </div>
        </div>
      </aside>

      <section className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-gradient-to-b from-slate-50 via-slate-100/50 to-slate-50 dark:from-slate-950 dark:via-slate-900/40 dark:to-slate-950 transition-colors duration-200">
        <div className="md:hidden flex items-center gap-2 px-4 pt-3 pb-1 shrink-0">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
            <span>{t("chat.sessions")}</span>
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {(() => {
              const msgs = sessionHistories[sessionId] || [];
              return getSessionTitle(msgs, t("chat.newChat"));
            })()}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {currentMessages
              .filter((m) => m.sender === "user" || m.text.trim().length > 0)
              .map((msg) => {
                const isUser = msg.sender === "user";
                const isWelcome = msg.id === "welcome";
                const displayText = isUser
                  ? msg.text
                  : isWelcome
                  ? cleanBotText(`${t("chat.welcomeTitle")}\n\n${t("chat.welcomeBody")}`)
                  : cleanBotText(msg.text);
                const isApiResponse = !isUser && !msg.isRejected && !isWelcome && msg.text.trim().length > 0 && !msg.text.startsWith("Cleared") && !msg.text.startsWith("🌾 **New");

                return (
                  <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-700 text-white flex items-center justify-center shrink-0 shadow-md mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    )}

                    <div className={`space-y-1 ${isUser ? "max-w-[78%]" : "max-w-[78%]"}`}>
                      <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? "bg-slate-900 text-white dark:bg-slate-700 rounded-tr-none shadow-md" : "bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 rounded-tl-none shadow-sm"}`}>
                        {msg.isRejected && (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2 pb-2 border-b border-amber-200 dark:border-amber-500/20">
                            <AlertTriangle className="w-4 h-4" />
                            <span>{t("chat.guardrailTriggered")}</span>
                          </div>
                        )}
                        <div className="chat-prose">
                          <ReactMarkdown
                            components={{
                              a: ({ href, children, ...props }) => {
                                let finalHref = href || "#";
                                if (finalHref.includes("myscheme.gov.in/schemes/") || finalHref.includes("myscheme.gov.in/ta/schemes/")) {
                                  const parts = finalHref.split("/schemes/");
                                  if (parts.length > 1) {
                                    const slug = parts[1].split("?")[0].split("#")[0].replace(/\/$/, "");
                                    finalHref = `/schemes/${slug}`;
                                  }
                                }
                                if (finalHref.startsWith("/")) {
                                  return (
                                    <Link
                                      href={finalHref}
                                      className="text-emerald-600 dark:text-emerald-400 font-semibold underline hover:text-emerald-500 transition-colors"
                                    >
                                      {children}
                                    </Link>
                                  );
                                }
                                return (
                                  <a
                                    href={finalHref}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-600 dark:text-emerald-400 font-semibold underline hover:text-emerald-500 transition-colors"
                                    {...props}
                                  >
                                    {children}
                                  </a>
                                );
                              },
                            }}
                          >
                            {displayText}
                          </ReactMarkdown>
                        </div>
                        {isApiResponse && (
                          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500 font-medium"><CheckCircle2 className="w-3 h-3" /> {t("chat.ragSource")}</span>
                            <button
                              onClick={() => handleCopyText(msg.id, msg.text)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                              title={t("chat.copy")}
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  <span className="text-emerald-500 font-medium">{t("chat.copied")}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{t("chat.copy")}</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      <span suppressHydrationWarning className={`text-[10px] text-slate-400 dark:text-slate-500 px-1 block ${isUser ? "text-right" : "text-left"}`}>
                        {isMounted ? msg.timestamp : "10:00 AM"}
                      </span>
                    </div>
                  </div>
                );
              })}

            {isLoading && (
              <div className="flex gap-3 max-w-xl">
                <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                </div>
                <div className="p-4 rounded-2xl rounded-tl-none bg-white border border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 text-sm shadow-md">
                  {t("chat.retrieving")}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md z-20">
          <div className="max-w-3xl mx-auto space-y-3">
            {currentMessages.length < 4 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 px-1">
                  <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" /> {t("chat.popularQueries")}
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt.title}
                      onClick={() => handleSend(prompt.query)}
                      className="p-2 sm:p-3 rounded-xl bg-white hover:bg-emerald-50/60 border border-slate-200 hover:border-emerald-400/50 text-slate-800 dark:bg-slate-900/90 dark:hover:bg-slate-800/80 dark:border-slate-800 dark:hover:border-emerald-500/40 text-left transition-all shadow-sm group"
                    >
                      <h5 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{prompt.title}</h5>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl p-2 pl-3 shadow-xl"
            >
              <button
                type="button"
                onClick={toggleVoiceInput}
                className={`p-2 rounded-full transition-colors shrink-0 ${isListening ? "bg-red-600 text-white animate-pulse" : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200"}`}
                title={isListening ? t("chat.listening") : "Click to speak query"}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? t("chat.listening") : t("chat.inputPlaceholder")}
                className="flex-1 bg-transparent px-2 py-1.5 text-sm text-slate-900 placeholder-slate-400 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none resize-none max-h-32 min-h-[36px]"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white flex items-center justify-center shadow-md transition-all active:scale-95 shrink-0"
                title="Send message"
              >
                <ArrowUp className="w-5 h-5 stroke-[2.5]" />
              </button>
            </form>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center tracking-tight font-normal">
              {t("chat.disclaimer")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageContent />
    </Suspense>
  );
}
