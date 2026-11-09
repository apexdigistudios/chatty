export interface VerificationStatus {
  isVerified?: boolean | null;
  verifiedExpiresAt?: string | null;
  isAdmin?: boolean | null;
  role?: string | null;
}

export function isGlobalAdminProfile(profile: VerificationStatus): boolean {
  const role = profile.role?.toLowerCase();
  return profile.isAdmin === true || role === "admin" || role === "global_admin";
}

export function hasActiveVerification(profile: VerificationStatus): boolean {
  return isGlobalAdminProfile(profile) || profile.isVerified === true;
}

export function verificationTitle(
  profile: VerificationStatus & { verifiedTitle?: string | null }
): string {
  return profile.verifiedTitle?.trim() || (isGlobalAdminProfile(profile) ? "Global Admin" : "Verified");
}
