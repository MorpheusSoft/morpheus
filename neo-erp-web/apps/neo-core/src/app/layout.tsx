import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "primeicons/primeicons.css";
import { SessionGuard } from "@/components/auth/SessionGuard";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Neo ERP Ecosystem",
  description: "Sistema Multi-Empresarial Unificado",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white`}
      >
        <SessionGuard>{children}</SessionGuard>
      </body>
    </html>
  );
}
