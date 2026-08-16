import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { I18nProvider } from "@/components/I18nProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tamil Nadu Farmer Schemes RAG Assistant",
  description: "AI-Powered Scheme Retrieval & Advisory Platform for Farmers in Tamil Nadu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark" suppressHydrationWarning>
      <body className="h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-700 dark:selection:text-emerald-300 font-sans antialiased">
        <ThemeProvider>
          <I18nProvider>
            <Navbar />
            <main className="flex-1 flex flex-col min-h-0">{children}</main>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
