import { useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNotificationStore } from "../../store/notificationStore";

/**
 * Headless bridge between Supabase Auth/Realtime and the notification store.
 * Mounted once in the app shell; renders nothing.
 */
export function NotificationListener() {
  const { user, profile } = useAuth();
  const load = useNotificationStore((state) => state.load);
  const connect = useNotificationStore((state) => state.connect);
  const reset = useNotificationStore((state) => state.reset);

  // Keep the freshest profile for the debounced realtime reloads.
  const profileRef = useRef(profile);
  profileRef.current = profile;

  // Primitive deps only — the profile object identity changes on every refresh.
  const userId = user?.id ?? null;
  const profileId = profile?.id ?? null;
  const schoolId = profile?.schoolId ?? null;
  const fullName = profile?.fullName ?? null;
  const username = profile?.username ?? null;

  useEffect(() => {
    const current = profileRef.current;
    if (!userId || !current) {
      reset();
      return;
    }
    void load(current);
    return connect(current);
  }, [userId, profileId, schoolId, fullName, username, connect, load, reset]);

  return null;
}
