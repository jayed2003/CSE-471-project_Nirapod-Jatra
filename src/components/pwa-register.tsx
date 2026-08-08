"use client";

import { useEffect } from "react";
import { cleanupExpiredCache } from "@/lib/offline";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(console.error);
      else navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(console.error);
    }
    cleanupExpiredCache().catch(console.error);
  }, []);
  return null;
}