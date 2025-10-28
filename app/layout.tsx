import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smart Web Summarizer",
  description: "Collez une URL et obtenez un résumé concis.",
  openGraph: {
    title: "Smart Web Summarizer",
    description: "Collez une URL et obtenez un résumé concis.",
    url: "https://example.com",
    siteName: "Smart Web Summarizer",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Smart Web Summarizer",
    description: "Collez une URL et obtenez un résumé concis.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
