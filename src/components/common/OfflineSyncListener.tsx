import { useEffect } from "react";
import { syncOfflineData } from "../../services/offlineSync";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function OfflineSyncListener() {
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      void syncOfflineData().catch((error: unknown) => {
        console.warn("Background offline sync failed.", error);
      });
    };

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const intervalId = window.setInterval(sync, REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
