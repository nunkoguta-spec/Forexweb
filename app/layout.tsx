import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// Pengaturan PWA untuk warna bar di Android/Windows
export const viewport: Viewport = {
  themeColor: "#09090b",
};

// Pengaturan PWA untuk iOS dan Manifest
export const metadata: Metadata = {
  title: "Forex Intel",
  description: "Forex News & Signal Intelligence Platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Forex Intel",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#09090b] text-slate-200 antialiased`}>
        {children}
      </body>
    </html>
  );
}