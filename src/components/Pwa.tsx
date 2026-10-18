"use client";

import { useEffect } from "react";

/** Registers the service worker that lets Android and iPhone offer “Add to Home Screen”. */
export function Pwa() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
