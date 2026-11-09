type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

let mixpanelClientPromise: Promise<typeof import("mixpanel-browser") | null> | null = null;
const MIXPANEL_TOKEN =
  process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "0663078b0e2dafed3259df60a6bf4356";

function getMixpanelClient(): Promise<typeof import("mixpanel-browser") | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!mixpanelClientPromise) {
    mixpanelClientPromise = import("mixpanel-browser")
      .then((mixpanel) => {
        mixpanel.init(MIXPANEL_TOKEN, {
          autocapture: false,
          debug: false,
          track_pageview: false,
        });
        return mixpanel;
      })
      .catch(() => null);
  }
  return mixpanelClientPromise;
}

export function initializeMixpanel(): void {
  void getMixpanelClient();
}

export function trackEvent(eventName: string, properties?: AnalyticsProperties): void {
  void getMixpanelClient().then((mixpanel) => {
    try {
      mixpanel?.track(eventName, properties);
    } catch {
      // Analytics must not interfere with the user action.
    }
  });
}

export function identifyUser(userId: string, traits?: AnalyticsProperties): void {
  void getMixpanelClient().then((mixpanel) => {
    try {
      if (!mixpanel) return;
      mixpanel.identify(userId);
      if (traits) mixpanel.people.set(traits);
    } catch {
      // Analytics must not interfere with authentication.
    }
  });
}

export function trackGistViewed(
  gistId: string,
  properties: Omit<AnalyticsProperties, "is_first_time_view">
): void {
  let firstTime = false;
  if (typeof window !== "undefined") {
    try {
      const key = "gistme:mixpanel:viewed-gists";
      const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      const viewed = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
      firstTime = !viewed.includes(gistId);
      if (firstTime) {
        window.localStorage.setItem(key, JSON.stringify([...viewed.slice(-999), gistId]));
      }
    } catch {
      firstTime = false;
    }
  }
  trackEvent("gist_viewed", { ...properties, is_first_time_view: firstTime });
}

export function trackGistShare(
  gistId: string,
  shareChannel: string,
  shareResult: string
): void {
  trackEvent("gist_shared", {
    gist_id: gistId,
    share_channel: shareChannel,
    share_result: shareResult,
    timestamp_source: new Date().toISOString(),
  });
}

export function rememberSignupStarted(timestamp: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("gistme:mixpanel:signup-started-at", timestamp);
  } catch {
    // Analytics state is optional and must not interrupt signup.
  }
}

export function rememberSignupCompleted(timestamp: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("gistme:mixpanel:signup-completed-at", timestamp);
  } catch {
    // Analytics state is optional and must not interrupt signup.
  }
}

export function secondsSinceSignupCompleted(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const timestamp = window.sessionStorage.getItem("gistme:mixpanel:signup-completed-at");
    if (!timestamp) return null;
    const elapsed = Math.floor((Date.now() - Date.parse(timestamp)) / 1000);
    return Number.isFinite(elapsed) ? Math.max(0, elapsed) : null;
  } catch {
    return null;
  }
}

export function resetUser(): void {
  void getMixpanelClient().then((mixpanel) => {
    try {
      mixpanel?.reset();
    } catch {
      // Analytics must not interfere with sign-out.
    }
  });
}
