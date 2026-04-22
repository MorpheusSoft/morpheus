import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
