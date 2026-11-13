ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_ambassador boolean NOT NULL DEFAULT false;

REVOKE UPDATE (is_ambassador, is_verified, verified_title, verified_expires_at, is_admin, role)
  ON public.profiles FROM anon, authenticated;
GRANT UPDATE (is_ambassador, is_verified, verified_title, verified_expires_at, is_admin, role)
  ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.guard_profile_verification_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged :=
    coalesce(auth.role(), '') = 'service_role'
    OR public.is_global_admin(auth.uid());

  IF TG_OP = 'INSERT' THEN
    IF NOT is_privileged AND (
      NEW.is_verified
      OR NEW.is_ambassador
      OR NEW.is_admin
      OR NEW.verified_title IS NOT NULL
      OR NEW.verified_expires_at IS NOT NULL
      OR NEW.role IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Verification and admin fields can only be set by global admins.';
    END IF;
  ELSIF NOT is_privileged AND (
    NEW.is_verified IS DISTINCT FROM OLD.is_verified
    OR NEW.is_ambassador IS DISTINCT FROM OLD.is_ambassador
    OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
    OR NEW.verified_title IS DISTINCT FROM OLD.verified_title
    OR NEW.verified_expires_at IS DISTINCT FROM OLD.verified_expires_at
    OR NEW.role IS DISTINCT FROM OLD.role
  ) THEN
    RAISE EXCEPTION 'Verification and admin fields can only be changed by global admins.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ambassador(
  target_user_id uuid,
  make_ambassador boolean
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
  SET is_ambassador = make_ambassador,
      is_verified = CASE
        WHEN make_ambassador THEN true
        ELSE coalesce(verified_expires_at > pg_catalog.now(), false)
      END,
      verified_title = CASE
        WHEN make_ambassador THEN 'Campus Ambassador'
        WHEN verified_expires_at > pg_catalog.now() THEN verified_title
        ELSE NULL
      END
  WHERE id = target_user_id
  RETURNING * INTO updated_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN updated_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_ambassador(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ambassador(uuid, boolean) TO authenticated;
