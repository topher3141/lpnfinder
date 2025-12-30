"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Use root scope so the whole app is covered
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // ignore registration errors (still works in browser mode)
    });
  }, []);

  return null;
}
