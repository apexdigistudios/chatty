type AnalyticsProperties = Record<string, any>;

let mixpanelClientPromise: Promise<typeof import("mixpanel-browser") | null> | null = null;

function getMixpanelClient(): Promise<typeof import("mixpanel-browser") | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token) return Promise.resolve(null);
  if (!mixpanelClientPromise) {
    mixpanelClientPromise = import("mixpanel-browser")
      .then((mixpanel) => {
        mixpanel.init(token, { debug: false, track_pageview: false });
        return mixpanel;
      })
      .catch(() => null);
  }
  return mixpanelClientPromise;
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

export function resetUser(): void {
  void getMixpanelClient().then((mixpanel) => {
    try {
      mixpanel?.reset();
    } catch {
      // Analytics must not interfere with sign-out.
    }
  });
}
