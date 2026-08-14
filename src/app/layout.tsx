import type { Metadata } from "next";
import "./globals.css";
import { AppToaster } from "@/components/AppToaster";
import { PwaRegister } from "@/components/pwa-register";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Nirapod Jatra",
  description: "Offline-ready route safety planning and emergency support.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <SiteNav />
        <AppToaster />
        {children}
      </body>
    </html>
  );
}
