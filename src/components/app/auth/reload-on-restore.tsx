"use client";
import { useEffect } from "react";

/**
 * After signing out, the browser's Back button can restore a dashboard page from
 * its back-forward cache without asking the server. Reloading such a page sends it
 * through the middleware again, which redirects to /login.
 */
export function ReloadOnRestore() {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return null;
}
