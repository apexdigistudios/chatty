type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function initializeMixpanel(): void {}

export function trackEvent(_eventName: string, _properties?: AnalyticsProperties): void {}

export function identifyUser(_userId: string, _traits?: AnalyticsProperties): void {}

export function trackGistViewed(
  _gistId: string,
  _properties: Omit<AnalyticsProperties, "is_first_time_view">
): void {}

export function trackGistShare(
  _gistId: string,
  _shareChannel: string,
  _shareResult: string
): void {}

export function rememberSignupStarted(_timestamp: string): void {}

export function rememberSignupCompleted(_timestamp: string): void {}

export function deferOnboardingCompletion(_userId: string): void {}

export function consumeDeferredOnboardingCompletion(_userId: string): boolean {
  return false;
}

export function secondsSinceSignupCompleted(): number | null {
  return null;
}

export function resetUser(): void {}
