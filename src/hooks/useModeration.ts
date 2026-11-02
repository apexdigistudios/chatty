import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useGistStore } from "../store/gistStore";

/**
 * Decentralised permission check: global admins moderate everywhere, school
 * founders (schools.creator_id) and appointed school moderators only their campus.
 */
export function useCanModerate(): (schoolId: string | null | undefined) => boolean {
  const { user, isGlobalAdmin, moderatedSchoolIds } = useAuth();
  const schools = useGistStore((state) => state.schools);

  return useCallback(
    (schoolId) => {
      if (!user) return false;
      if (isGlobalAdmin) return true;
      if (!schoolId) return false;
      if (moderatedSchoolIds.includes(schoolId)) return true;
      return schools.some((school) => school.id === schoolId && school.creatorId === user.id);
    },
    [user, isGlobalAdmin, moderatedSchoolIds, schools]
  );
}
