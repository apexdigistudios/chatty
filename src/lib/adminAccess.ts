const ADMIN_EMAILS = ["nbamellow77@gmail.com", "hello.gistme@gmail.com"];

export function isAuthorizedAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(email.trim().toLowerCase()));
}
