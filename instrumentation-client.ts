import posthog from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!posthogKey || !posthogHost) {
  if (process.env.NODE_ENV !== "production") {
    if (!posthogKey) {
      console.error(
        new Error(
          "NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured",
        ),
      );
    }

    if (!posthogHost) {
      console.error(
        new Error(
          "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
        ),
      );
    }
  }
} else {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_exceptions: true,
    defaults: "2025-05-24",
    debug: process.env.NODE_ENV === "development",
  });
}
