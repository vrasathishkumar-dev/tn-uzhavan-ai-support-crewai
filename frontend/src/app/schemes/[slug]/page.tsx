"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  FileText,
  ExternalLink,
  Sparkles,
  Copy,
  Check,
  ShieldAlert,
  ListOrdered,
  Tag,
  Building2,
  MapPin,
  HelpCircle,
  ChevronDown,
  Link2
} from "lucide-react";
import { fetchSchemeBySlug, Scheme, cleanHtmlText, parseFaqs, parseSources } from "@/lib/api";

function FormattedContent({ content }: { content: string | undefined | null }) {
  const { i18n } = useTranslation();
  if (!content) return null;
  let cleaned = cleanHtmlText(content);
  if (!cleaned) return null;

  if (i18n.language === "ta") {
    cleaned = cleaned
      .replace(/^Mode:\s*Offline/gmi, "விண்ணப்பிக்கும் முறை: நேரில் (Offline)")
      .replace(/^Mode:\s*Online/gmi, "விண்ணப்பிக்கும் முறை: இணையவழியில் (Online)")
      .replace(/^Mode:\s*Hybrid/gmi, "விண்ணப்பிக்கும் முறை: கலப்பு முறை (Hybrid)")
      .replace(/^Mode:\s*/gmi, "விண்ணப்பிக்கும் முறை: ");
  }

  const rawLines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-2 text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
      {rawLines.map((line, idx) => {
        const isBullet = line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ");
        const textToParse = isBullet ? line.replace(/^[-*•]\s*/, "") : line;

        // Split by **bold** tags
        const parts = textToParse.split(/(\*\*[^*]+\*\*)/g);

        const renderedLine = parts.map((part, pIdx) => {
          if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
            return (
              <strong key={pIdx} className="font-bold text-slate-900 dark:text-white">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return part;
        });

        if (isBullet) {
          return (
            <div key={idx} className="flex items-start gap-2.5 my-1.5">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2" />
              <div className="flex-1">{renderedLine}</div>
            </div>
          );
        }

        return <p key={idx}>{renderedLine}</p>;
      })}
    </div>
  );
}

export default function SchemeDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const { t, i18n } = useTranslation();

  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "benefits" | "eligibility" | "documents" | "application" | "faqs">("overview");
  const [copied, setCopied] = useState<boolean>(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const data = await fetchSchemeBySlug(slug, i18n.language);
        if (isMounted) setScheme(data);
      } catch (err: unknown) {
        if (isMounted) setError(err instanceof Error ? err.message : "Scheme not found");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    if (slug) {
      loadData();
    }
    return () => {
      isMounted = false;
    };
  }, [slug, i18n.language]);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-600 dark:text-slate-400">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-medium animate-pulse">{t("detail.loading")}</p>
      </div>
    );
  }

  if (error || !scheme) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-800 dark:text-slate-200">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t("detail.notFoundTitle")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {error || t("detail.notFoundDesc")}
          </p>
          <Link
            href="/schemes"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> {t("detail.back")}
          </Link>
        </div>
      </div>
    );
  }

  const faqItems = parseFaqs(scheme.faqs);
  const sourceItems = parseSources(scheme.sources, scheme.url);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link
            href="/schemes"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t("detail.back")}
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors text-xs font-medium inline-flex items-center gap-1.5"
              title="Copy page link"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? t("detail.copiedLink") : t("detail.copyLink")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Banner Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 border border-emerald-500/20 p-6 sm:p-10 text-white shadow-2xl space-y-6">
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {scheme.level || "State"} {t("detail.scheme")}
            </span>
            {scheme.state && (
              <span className="px-3.5 py-1 rounded-full text-xs font-semibold bg-slate-800/80 text-slate-300 border border-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" /> {scheme.state}
              </span>
            )}
            {scheme.categories?.map((cat) => (
              <span
                key={cat}
                className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-900/50 text-emerald-200 border border-emerald-800/60"
              >
                {cat}
              </span>
            ))}
          </div>

          {/* Title & Abbr */}
          <div className="space-y-2 max-w-4xl">
            <h1 className="text-2xl sm:text-4xl font-black leading-tight tracking-tight text-white">
              {scheme.scheme_name}
            </h1>
            {scheme.short_title && (
              <p className="text-sm font-bold text-emerald-400">
                {t("detail.abbreviation")} <span className="bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{scheme.short_title}</span>
              </p>
            )}
          </div>

          {/* Action Row */}
          <div className="pt-4 flex flex-wrap items-center gap-4">
            <Link
              href={`/?query=${encodeURIComponent(i18n.language === "ta" ? `${scheme.scheme_name} பற்றிய விபரங்கள் மற்றும் விண்ணப்பிக்கும் முறையைக் கூறுங்கள்` : `Tell me about ${scheme.scheme_name} and how to apply`)}`}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 inline-flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
            >
              <Sparkles className="w-4 h-4" /> {t("detail.askAi")}
            </Link>

            {scheme.url && (
              <a
                href={scheme.url}
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-800 text-slate-100 font-semibold text-sm border border-slate-700 inline-flex items-center gap-2 transition-all"
              >
                {t("detail.applyGovPortal")} <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto gap-2 scrollbar-none">
          {([
            { id: "overview", label: t("detail.overview"), icon: BookOpen },
            { id: "benefits", label: t("detail.benefits"), icon: CheckCircle },
            { id: "eligibility", label: t("detail.eligibility"), icon: Tag },
            { id: "documents", label: t("detail.documents"), icon: FileText },
            { id: "application", label: t("detail.process"), icon: ListOrdered },
            { id: "faqs", label: `${t("detail.faqs")} (${faqItems.length})`, icon: HelpCircle },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-bold border-b-2 whitespace-nowrap inline-flex items-center gap-2 transition-all ${
                  isActive
                    ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-t-xl"
                    : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Areas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
                    <BookOpen className="w-5 h-5 text-emerald-500" /> {t("detail.briefOverview")}
                  </h2>
                  <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                    <FormattedContent content={scheme.brief_description || t("detail.noSummary")} />
                  </div>
                </div>

                {Boolean(cleanHtmlText(scheme.benefits)) && (
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" /> {t("detail.primaryHighlights")}
                    </h3>
                    <div className="bg-emerald-500/5 dark:bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/20">
                      <FormattedContent content={scheme.benefits} />
                    </div>
                  </div>
                )}

                {faqItems.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-emerald-500" /> {t("detail.faqs")}
                      </h3>
                      <button
                        onClick={() => setActiveTab("faqs")}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        {t("detail.viewAllFaqs")} ({faqItems.length}) &rarr;
                      </button>
                    </div>
                    <div className="space-y-3">
                      {faqItems.slice(0, 2).map((item, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5"
                        >
                          <p className="text-xs font-bold text-slate-900 dark:text-white flex items-start gap-2">
                            <span className="text-emerald-500 font-extrabold">Q:</span> {item.question}
                          </p>
                          <div className="pl-4">
                            <FormattedContent content={item.answer} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sourceItems.length > 0 && (
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      {t("detail.sourcesAndRefs")}
                    </h3>
                    <div className="flex flex-wrap gap-4 items-center">
                      {sourceItems.map((item, idx) => (
                        <a
                          key={idx}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-sm hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors group"
                        >
                          <span className="underline underline-offset-4 decoration-slate-400 group-hover:decoration-emerald-500">
                            {item.title}
                          </span>
                          <ExternalLink className="w-5 h-5 text-rose-800 dark:text-rose-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Benefits Tab */}
            {activeTab === "benefits" && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" /> {t("detail.benefitsTitle")}
                </h2>
                <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <FormattedContent content={scheme.benefits || t("detail.benefitsNotSpecified")} />
                </div>
              </section>
            )}

            {/* Eligibility Tab */}
            {activeTab === "eligibility" && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                    <Tag className="w-5 h-5 text-teal-500" /> {t("detail.eligibilityTitle")}
                  </h2>
                  <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <FormattedContent content={scheme.eligibility || t("detail.eligibilityNotSpecified")} />
                  </div>
                </div>

                {Boolean(cleanHtmlText(scheme.exclusions)) && (
                  <div>
                    <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 mb-2">
                      <ShieldAlert className="w-4 h-4" /> {t("detail.exclusionsTitle")}
                    </h3>
                    <div className="bg-rose-500/5 dark:bg-rose-500/10 p-5 rounded-2xl border border-rose-500/20">
                      <FormattedContent content={scheme.exclusions} />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Documents Tab */}
            {activeTab === "documents" && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-500" /> {t("detail.documentsTitle")}
                </h2>
                <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <FormattedContent content={scheme.documents_required || t("detail.documentsFallback")} />
                </div>
              </section>
            )}

            {/* Application Process Tab */}
            {activeTab === "application" && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ListOrdered className="w-5 h-5 text-indigo-500" /> {t("detail.processTitle")}
                </h2>
                <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <FormattedContent content={scheme.application_process || t("detail.processFallback")} />
                </div>
              </section>
            )}

            {/* FAQs Tab */}
            {activeTab === "faqs" && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-emerald-500" /> {t("detail.faqs")}
                  </h2>
                  <span className="text-xs font-semibold px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">
                    {faqItems.length} {faqItems.length === 1 ? t("detail.faqQuestion") : t("detail.faqQuestions")}
                  </span>
                </div>

                {faqItems.length > 0 ? (
                  <div className="space-y-4">
                    {faqItems.map((item, idx) => {
                      const isOpen = openFaqIndex === idx;
                      return (
                        <div
                          key={idx}
                          className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all bg-slate-50/50 dark:bg-slate-950/40"
                        >
                          <button
                            onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                            className="w-full p-4 sm:p-5 text-left font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between gap-3 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <span className="flex items-start gap-2.5">
                              <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-black">
                                Q
                              </span>
                              <span>{item.question}</span>
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                                isOpen ? "rotate-180" : ""
                              }`}
                            />
                          </button>

                          {isOpen && (
                            <div className="px-5 pb-5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900">
                              <FormattedContent content={item.answer} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800 text-sm">
                    {t("detail.noFaqs")}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Sidebar / Quick Actions */}
          <aside className="space-y-6">
            {/* Quick Summary Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {t("detail.metadataTitle")}
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">{t("detail.jurisdiction")}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{scheme.level || "State"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">{t("detail.targetState")}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{scheme.state || "Tamil Nadu"}</span>
                </div>
                <div className="py-2 border-b border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">{t("detail.categories")}</span>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {scheme.categories?.map((c) => (
                      <span key={c} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                {scheme.tags && scheme.tags.length > 0 && (
                  <div className="py-2 space-y-1">
                    <span className="text-slate-500 dark:text-slate-400">{t("detail.keywords")}</span>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {scheme.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sources & References Sidebar Card */}
            {sourceItems.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-emerald-500" /> {t("detail.sourcesAndRefs")}
                </h3>
                <div className="space-y-2 pt-1">
                  {sourceItems.map((item, idx) => (
                    <a
                      key={idx}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-emerald-50/60 dark:bg-slate-950/60 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors group"
                    >
                      <span className="underline underline-offset-2 decoration-slate-400 group-hover:decoration-emerald-500 font-bold truncate">
                        {item.title}
                      </span>
                      <ExternalLink className="w-4 h-4 shrink-0 text-rose-800 dark:text-rose-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform ml-2" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* AI Assistant Help */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-xl space-y-3">
              <Sparkles className="w-8 h-8 text-emerald-200" />
              <h3 className="text-base font-bold">{t("detail.aiQuestionsTitle")}</h3>
              <p className="text-xs text-emerald-100 leading-relaxed">
                {t("detail.aiQuestionsDesc")}
              </p>
              <Link
                href={`/?query=${encodeURIComponent(i18n.language === "ta" ? `${scheme.scheme_name} பற்றிய விபரங்கள் மற்றும் விண்ணப்பிக்கும் முறையைக் கூறுங்கள்` : `Tell me about ${scheme.scheme_name} and how to apply`)}`}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-white text-emerald-950 font-bold text-xs shadow hover:bg-emerald-50 transition-colors inline-flex items-center justify-center gap-2"
              >
                {t("detail.askAssistantNow")}
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
