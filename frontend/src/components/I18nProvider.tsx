"use client";

import React, { useEffect } from "react";
import "@/lib/i18n";
import i18n from "@/lib/i18n";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const savedLang = localStorage.getItem("app_lang") || "en";
    if (i18n.language !== savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, []);

  return <>{children}</>;
}
