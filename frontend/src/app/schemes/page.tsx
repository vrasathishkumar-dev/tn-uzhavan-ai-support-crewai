"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  Search,
  Filter,
  RefreshCw,
  BookOpen,
  MessageSquare,
  X,
} from "lucide-react";
import { fetchSchemes, fetchCategories, getCachedCategories, getCachedSchemes, Scheme } from "@/lib/api";

export default function SchemesPage() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || "en";
  const cachedData = getCachedSchemes(currentLang);
  const cachedCats = getCachedCategories(currentLang);

  const [schemes, setSchemes] = useState<Scheme[]>(() => cachedData?.schemes || []);
  const [categories, setCategories] = useState<string[]>(() => cachedCats || []);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(() => !cachedData || cachedData.schemes.length === 0);

  const loadSchemesData = useCallback(async (cat: string, query: string, lang: string) => {
    const cached = getCachedSchemes(lang, cat, query);
    if (cached && cached.schemes.length > 0) {
      setSchemes(cached.schemes);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [cats, data] = await Promise.all([
        fetchCategories(lang),
        fetchSchemes({ search: query, category: cat, limit: 100, lang })
      ]);
      setCategories(cats || []);
      setSchemes(data.schemes || []);
    } catch (e) {
      console.error("Failed to fetch schemes", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchemesData(selectedCategory, searchQuery, currentLang);
  }, [currentLang, selectedCategory, loadSchemesData]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const data = await fetchSchemes({ search: searchQuery, category: selectedCategory, limit: 100, lang: i18n.language });
      setSchemes(data.schemes || []);
    } catch (e) {
      console.error("Failed to search schemes", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategorySelect = (cat: string) => {
    const newCat = selectedCategory === cat ? "" : cat;
    setSelectedCategory(newCat);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-gradient-to-r from-emerald-100/90 via-slate-100 to-teal-100/90 dark:from-emerald-950/80 dark:via-slate-900 dark:to-teal-950/80 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-emerald-200 dark:border-emerald-800/30 shadow-xl">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                {t("schemes.badge")}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t("schemes.title")}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              {t("schemes.subtitle")}
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/20 transition-all shrink-0 self-start sm:self-auto"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{t("schemes.askAi")}</span>
          </Link>
        </div>

        {/* Search Bar & Category Filter Chips */}
        <div className="space-y-3 sm:space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="flex-1 flex items-center bg-white border border-slate-300 focus-within:border-emerald-600 dark:bg-slate-900 dark:border-slate-800 dark:focus-within:border-emerald-500/60 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 shadow-lg transition-colors">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 mr-2.5 sm:mr-3 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("schemes.searchPlaceholder")}
                className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={async () => {
                    setSearchQuery("");
                    setIsLoading(true);
                    try {
                      const data = await fetchSchemes({ search: "", category: selectedCategory, limit: 100, lang: i18n.language });
                      setSchemes(data.schemes || []);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-2xl shadow-md transition-all shrink-0"
            >
              {t("schemes.searchBtn")}
            </button>
          </form>

          {/* Categories Horizontal Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1 shrink-0 mr-1">
              <Filter className="w-3.5 h-3.5" /> {t("schemes.filterLabel")}
            </span>
            <button
              onClick={() => handleCategorySelect("")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                selectedCategory === ""
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {t("schemes.allCategories")}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategorySelect(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                  selectedCategory === cat
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Schemes Grid Container */}
      <div className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-500" />
            <p className="text-sm font-medium">{t("schemes.fetching")}</p>
          </div>
        ) : schemes.length === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-white border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 rounded-2xl sm:rounded-3xl space-y-3 shadow-sm">
            <BookOpen className="w-10 h-10 sm:w-12 sm:h-12 text-slate-400 dark:text-slate-500 mx-auto" />
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-300">{t("schemes.noResults")}</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {t("schemes.noResultsDesc")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {schemes.map((scheme, idx) => (
              <Link
                key={scheme.slug || idx}
                href={`/schemes/${scheme.slug}`}
                className="group bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-500/50 dark:bg-slate-900/80 dark:hover:bg-slate-900 dark:border-slate-800 dark:hover:border-emerald-500/40 rounded-2xl p-4 sm:p-6 flex flex-col justify-between transition-all duration-200 shadow-md hover:shadow-xl cursor-pointer"
              >
                <div className="space-y-3">
                  {/* Category badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      {scheme.state || "Tamil Nadu"}
                    </span>
                    {scheme.categories.slice(0, 2).map((c) => (
                      <span
                        key={c}
                        className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>

                  {/* Scheme Name */}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors line-clamp-2">
                    {scheme.scheme_name}
                  </h3>

                  {/* Brief description */}
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                    {scheme.brief_description || "Detailed agricultural assistance scheme for farmers."}
                  </p>
                </div>

                {/* Footer action */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium group-hover:underline">
                    {t("schemes.viewDetails")} &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
