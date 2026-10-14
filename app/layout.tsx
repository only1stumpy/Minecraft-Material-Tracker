import type { Metadata, Viewport } from "next";
import { Onest, Prata } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";

const onest = Onest({
  subsets: ["cyrillic", "latin"],
  variable: "--font-onest",
  weight: "variable",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const prata = Prata({
  subsets: ["cyrillic", "latin"],
  variable: "--font-prata",
  weight: "400",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

export const metadata: Metadata = {
  title: { default: "Antville Builder", template: "%s — Antville Builder" },
  description: "Совместное управление строительством города Антвилль",
};

export const viewport: Viewport = {
  themeColor: "#09070a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${onest.variable} ${prata.variable} antialiased`}>
        <AppHeader />{children}
      </body>
    </html>
  );
}
