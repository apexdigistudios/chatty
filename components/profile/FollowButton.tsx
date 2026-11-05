'use client';

import { UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface FollowButtonProps {
  following: boolean;
  loading?: boolean;
  onToggle: () => void;
}

export function FollowButton({ following, loading = false, onToggle }: FollowButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant={following ? "outline" : "primary"}
      loading={loading}
      leftIcon={following ? <UserCheck size={15} strokeWidth={2.6} aria-hidden /> : <UserPlus size={15} strokeWidth={2.6} aria-hidden />}
      onClick={onToggle}
      aria-pressed={following}
      aria-label={following ? "Unfollow this student" : "Follow this student"}
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
