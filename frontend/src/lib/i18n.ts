import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import ta from "@/locales/ta.json";

const resources = {
  en: { translation: en },
  ta: { translation: ta },
};

// Initialize i18next synchronously
if (!i18n.isInitialized) {
  const initialLang = typeof window !== "undefined" ? (localStorage.getItem("app_lang") || "en") : "en";

  i18n.use(initReactI18next).init({
    resources,
    lng: initialLang,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false,
    },
  });
} else {
  i18n.addResourceBundle("en", "translation", en, true, true);
  i18n.addResourceBundle("ta", "translation", ta, true, true);
}

export default i18n;
