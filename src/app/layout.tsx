import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velora Art Designs — Printable Wall Art & Frame TV Art",
  description:
    "Original printable wall art and Frame TV art from Velora Art Designs, sold on Etsy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Üç font değişkeni de burada uygulanır (bkz. lib/fonts.ts) — marketing layout'u
    // Fraunces'i ayrıca yüklemez, aynı örneği paylaşır.
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      {/* Kâğıt zemin: marketing bölümü kendi sarmalayıcısında zaten #f1ece2 (= paper)
          kullandığı için orada görsel fark olmaz; panel bu zemini devralır. */}
      <body className="min-h-full bg-paper text-ink-body">{children}</body>
    </html>
  );
}
