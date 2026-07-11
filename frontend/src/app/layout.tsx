import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import SplashWrapper from "@/components/loaders/SplashWrapper";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IndusMind AI – Industrial Knowledge Intelligence Platform",
  description:
    "Enterprise-grade AI platform for unified asset & operations intelligence. Upload manuals, SOPs, inspection reports and ask engineering questions with full source citations.",
  keywords: ["industrial AI", "knowledge graph", "RAG", "maintenance intelligence", "compliance"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <SplashWrapper>
            {children}
          </SplashWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
