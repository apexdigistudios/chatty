import { COMPRESSION_PRESETS, compressImageFile } from "@/lib/imageCompression";
import { supabase } from "@/lib/supabase";
import { isVideoFile } from "@/services/storageService";
import { uploadFileToR2WithMetadata } from "@/lib/r2Upload";

interface SchoolHighlightAuthor {
  id: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean | null;
  verified_expires_at: string | null;
  verified_title: string | null;
  is_admin: boolean | null;
  role: string | null;
}

interface SchoolHighlightRow {
  id: string;
  user_id: string;
  school_id: string;
  media_url: string;
  thumbnail_url: string | null;
  media_type: "image" | "video";
  created_at: string;
  expires_at: string;
  author: SchoolHighlightAuthor | SchoolHighlightAuthor[] | null;
}

export interface SchoolHighlight {
  id: string;
  userId: string;
  schoolId: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  mediaType: "image" | "video";
  createdAt: string;
  expiresAt: string;
  author: {
    id: string;
    username: string;
    avatarUrl: string | null;
    isVerified: boolean;
    verifiedExpiresAt: string | null;
    verifiedTitle: string | null;
    isAdmin: boolean;
    role: string | null;
  };
}

export async function fetchSchoolHighlights(schoolId: string | null): Promise<SchoolHighlight[]> {
  let query = supabase
    .from("school_highlights")
    .select("id, user_id, school_id, media_url, thumbnail_url, media_type, created_at, expires_at, author:profiles(id, username, avatar_url, is_verified, verified_expires_at, verified_title, is_admin, role)")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(100);
  if (schoolId) query = query.eq("school_id", schoolId);
  const { data, error } = await query.returns<SchoolHighlightRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((row) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    if (!author) return [];
    return [{
      id: row.id,
      userId: row.user_id,
      schoolId: row.school_id,
      mediaUrl: row.media_url,
      thumbnailUrl: row.thumbnail_url,
      mediaType: row.media_type,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      author: {
        id: author.id,
        username: author.username,
        avatarUrl: author.avatar_url,
        isVerified: author.is_verified === true,
        verifiedExpiresAt: author.verified_expires_at,
        verifiedTitle: author.verified_title,
        isAdmin: author.is_admin === true,
        role: author.role,
      },
    }];
  });
}

export async function createSchoolHighlight(schoolId: string, file: File): Promise<void> {
  const video = isVideoFile(file);
  if (!video && !file.type.startsWith("image/")) {
    throw new Error("Choose a photo or a video.");
  }
  if (video && file.size > 30 * 1024 * 1024) {
    throw new Error("Highlight videos must be 30MB or smaller.");
  }

  const mediaFile = video ? file : await compressImageFile(file, COMPRESSION_PRESETS.posts);
  const contentType = video ? file.type.split(";")[0] : mediaFile.type;
  const uploaded = await uploadFileToR2WithMetadata(mediaFile, "highlights", contentType, schoolId);
  if (video && (uploaded.duration === undefined || uploaded.duration > 15)) {
    throw new Error("Highlight videos must be 15 seconds or shorter.");
  }

  const { error } = await supabase.rpc("create_school_highlight", {
    p_school_id: schoolId,
    p_media_url: uploaded.url,
    p_thumbnail_url: uploaded.thumbnailUrl ?? null,
    p_media_type: video ? "video" : "image",
  });
  if (error) throw new Error(error.message);
}
