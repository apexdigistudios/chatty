export interface VerificationStatus {
  isVerified?: boolean | null;
  verifiedExpiresAt?: string | null;
  isAdmin?: boolean | null;
  role?: string | null;
}

export function isGlobalAdminProfile(profile: VerificationStatus): boolean {
  return profile.isAdmin === true || profile.role === "admin" || profile.role === "global_admin";
}

export function hasActiveVerification(profile: VerificationStatus, now = Date.now()): boolean {
  return isGlobalAdminProfile(profile) || (
    profile.isVerified === true &&
    Boolean(profile.verifiedExpiresAt) &&
    Date.parse(profile.verifiedExpiresAt!) > now
  );
}

export function verificationTitle(
  profile: VerificationStatus & { verifiedTitle?: string | null }
): string {
  return profile.verifiedTitle?.trim() || (isGlobalAdminProfile(profile) ? "Global Admin" : "Verified");
}
