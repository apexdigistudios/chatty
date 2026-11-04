export const GLOBAL_ADMIN_EMAILS = [
  "nbamellow77@gmail.com",
  "hello.gistme@gmail.com",
];

export const isUserGlobalAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return GLOBAL_ADMIN_EMAILS.includes(email.trim().toLowerCase());
};

export const isAuthorizedAdminEmail = isUserGlobalAdmin;
