import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";

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
      <body className="antialiased">
        <AppHeader />{children}
      </body>
    </html>
  );
}
