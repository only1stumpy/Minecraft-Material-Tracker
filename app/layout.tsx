import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";

export const metadata: Metadata = {
  title: { default: "Antville Builder", template: "%s — Antville Builder" },
  description: "Совместное управление строительством города Антвилль",
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
