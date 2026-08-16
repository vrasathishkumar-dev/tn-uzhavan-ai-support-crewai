"use client";

import Link from "next/link";
import { Sprout, Sun, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/ThemeProvider";

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const isDark = theme === "dark";
  const currentLang = i18n.language || "en";

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("app_lang", lang);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 text-slate-900 dark:border-emerald-900/30 dark:bg-slate-950/80 dark:text-slate-100 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand Logo & Name */}
        <Link href="/" className="flex items-center gap-2 sm:gap-3 group shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/20 group-hover:scale-105 transition-transform duration-200">
            <Sprout className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm sm:text-lg tracking-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-amber-600 dark:from-emerald-400 dark:via-teal-300 dark:to-amber-300 bg-clip-text text-transparent truncate">
                {t("nav.title")}
              </span>
              <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                v1.0
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[240px]">
              {t("nav.subtitle")}
            </p>
          </div>
        </Link>

        {/* Right Status & Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Global i18n Language Toggle Button */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
            <button
              onClick={() => changeLanguage("en")}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                currentLang === "en"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="English"
            >
              EN
            </button>
            <button
              onClick={() => changeLanguage("ta")}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                currentLang === "ta"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="தமிழ் (Tamil)"
            >
              தமிழ்
            </button>
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-amber-600 border border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-amber-300 dark:border-slate-800 transition-all shadow-sm active:scale-95 flex items-center justify-center cursor-pointer"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>
      </div>
    </header>
  );
}
