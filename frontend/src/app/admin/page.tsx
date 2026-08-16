"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  HelpCircle,
  CheckCircle,
  Clock,
  Activity,
  BookOpen,
  RefreshCw,
  Database,
} from "lucide-react";
import {
  fetchSystemStats,
  fetchUnansweredQueries,
  updateQueryStatus,
  SystemStats,
  UnansweredQuery,
} from "@/lib/api";

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [queries, setQueries] = useState<UnansweredQuery[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsData, queriesData] = await Promise.all([
        fetchSystemStats(),
        fetchUnansweredQueries(),
      ]);
      setStats(statsData);
      setQueries(queriesData);
    } catch (e) {
      console.error("Error loading admin dashboard data", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    setUpdatingId(id);
    try {
      await updateQueryStatus(id, newStatus);
      setQueries((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status: newStatus as UnansweredQuery["status"] } : q))
      );
      // Reload stats
      const newStats = await fetchSystemStats();
      setStats(newStats);
    } catch (e) {
      console.error("Failed to update query status", e);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredQueries = queries.filter((q) => {
    if (filterStatus === "ALL") return true;
    return q.status === filterStatus;
  });

  return (
    <div className="flex-1 min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 p-4 sm:p-6 lg:p-8 space-y-8 transition-colors duration-200">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> {t("nav.admin")}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t("admin.title")}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {t("admin.subtitle")}
          </p>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-600 dark:text-emerald-400" : ""}`} />
          <span>{t("admin.refresh")}</span>
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-slate-200 dark:bg-slate-900/90 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{t("admin.totalSchemes")}</span>
            <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {stats ? stats.total_schemes : "..."}
          </div>
          <p className="text-xs text-slate-500">{t("admin.totalSchemesSub")}</p>
        </div>

        <div className="bg-white border border-slate-200 dark:bg-slate-900/90 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{t("admin.pendingQueries")}</span>
            <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {stats ? stats.total_unanswered_queries : "..."}
          </div>
          <p className="text-xs text-slate-500">{t("admin.pendingQueriesSub")}</p>
        </div>

        <div className="bg-white border border-slate-200 dark:bg-slate-900/90 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{t("admin.resolvedQueries")}</span>
            <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="text-3xl font-black text-amber-600 dark:text-amber-400">
            {stats ? stats.pending_queries : "..."}
          </div>
          <p className="text-xs text-slate-500">{t("admin.resolvedQueriesSub")}</p>
        </div>

        <div className="bg-white border border-slate-200 dark:bg-slate-900/90 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{t("admin.activeSessions")}</span>
            <Activity className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-3xl font-black text-teal-600 dark:text-teal-400">
            {stats ? stats.active_sessions : "..."}
          </div>
          <p className="text-xs text-slate-500">{t("admin.activeSessionsSub")}</p>
        </div>
      </div>

      {/* Unanswered Queries Monitor Table */}
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> {t("admin.unansweredTitle")}
          </h2>

          {/* Filter Status Tabs */}
          <div className="flex items-center bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-1 rounded-xl text-xs">
            {["ALL", "PENDING", "RESOLVED", "IGNORED"].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  filterStatus === st
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {st === "ALL" ? t("admin.all") : st === "PENDING" ? t("admin.pending") : st === "RESOLVED" ? t("admin.resolved") : t("admin.ignored")}
              </button>
            ))}
          </div>
        </div>

        {/* Table / List View */}
        <div className="bg-white border border-slate-200 dark:bg-slate-900/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 dark:text-emerald-500 mx-auto" />
              <p className="text-sm font-medium">{t("admin.loadingDatabase")}</p>
            </div>
          ) : filteredQueries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{t("admin.noQueries")}</h3>
              <p className="text-xs text-slate-500">
                {t("admin.noQueriesDesc")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {filteredQueries.map((item) => (
                <div
                  key={item.id}
                  className="p-5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 max-w-3xl">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono text-slate-400 dark:text-slate-500">ID #{item.id}</span>
                      <span>•</span>
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                      <span>•</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === "PENDING"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                            : item.status === "RESOLVED"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {/* Query */}
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">
                      &quot;{item.query}&quot;
                    </h4>

                    {/* AI Response output */}
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 bg-slate-50 border border-slate-200 dark:bg-slate-950/60 dark:border-slate-800/80 p-2.5 rounded-xl mt-2 font-mono">
                      🤖 {t("admin.botResponse")}: {item.response}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status !== "RESOLVED" && (
                      <button
                        disabled={updatingId === item.id}
                        onClick={() => handleStatusChange(item.id, "RESOLVED")}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-600 text-emerald-700 hover:text-white dark:bg-emerald-600/20 dark:hover:bg-emerald-600 dark:text-emerald-300 dark:hover:text-white border border-emerald-500/30 text-xs font-medium transition-all"
                      >
                        {t("admin.markResolved")}
                      </button>
                    )}
                    {item.status !== "PENDING" && (
                      <button
                        disabled={updatingId === item.id}
                        onClick={() => handleStatusChange(item.id, "PENDING")}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-600 text-amber-700 hover:text-white dark:bg-amber-500/20 dark:hover:bg-amber-600 dark:text-amber-300 dark:hover:text-white border border-amber-500/30 text-xs font-medium transition-all"
                      >
                        {t("admin.markPending")}
                      </button>
                    )}
                    {item.status !== "IGNORED" && (
                      <button
                        disabled={updatingId === item.id}
                        onClick={() => handleStatusChange(item.id, "IGNORED")}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400 text-xs font-medium transition-all"
                      >
                        {t("admin.markIgnored")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
