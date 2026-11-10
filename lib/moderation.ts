import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { ProcessedVideo } from "@/lib/videoProcessor";

const MODERATION_MODEL = "omni-moderation-latest";
const SAFE_UPLOAD_MESSAGE =
  "Oops! That image or video goes against our community safety rules. Please upload a friendly, safe-for-school file.";
const SAFE_VIDEO_MESSAGE =
  "Oops! That video goes against our community safety rules. Please upload a safe-for-school file.";
const SAFE_CAPTION_MESSAGE =
  "Please change your caption so it follows our community safety rules.";

type Categories = Record<string, boolean>;

interface ModerationResult {
  flagged: boolean;
  categories: Categories;
}

export class CommunitySafetyViolationError extends Error {
  constructor(message = SAFE_UPLOAD_MESSAGE) {
    super(message);
    this.name = "CommunitySafetyViolationError";
  }
}

export class ModerationUnavailableError extends Error {
  constructor(message = "Safety checks are taking a break. Please try again soon.") {
    super(message);
    this.name = "ModerationUnavailableError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readModerationResult(value: unknown): ModerationResult | null {
  if (!isRecord(value) || typeof value.flagged !== "boolean" || !isRecord(value.categories)) {
    return null;
  }
  const categories: Categories = {};
  for (const [name, flagged] of Object.entries(value.categories)) {
    if (typeof flagged !== "boolean") return null;
    categories[name] = flagged;
  }
  return { flagged: value.flagged, categories };
}

function abusiveCaptionCategories(text: string): Categories {
  const normalized = text.normalize("NFKC");
  const patterns: Array<[string, RegExp]> = [
    ["threat", /\b(?:i(?:'m| am) going to kill you|i will find you|i know where you live)\b/i],
    ["self_harm_encouragement", /\b(?:kys|go kill yourself|kill yourself)\b/i],
    ["doxxing", /\b(?:doxx?(?:ing)? you|leak(?:ing)? (?:your )?(?:nudes?|address|phone number))\b/i],
    ["sexual_violence", /\b(?:i will rape you|rape you)\b/i],
  ];
  return Object.fromEntries(
    patterns.filter(([, pattern]) => pattern.test(normalized)).map(([category]) => [category, true])
  );
}

function moderationClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new ModerationUnavailableError("Safety checks are not set up yet. Please try again later.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function writeAudit(input: {
  userId: string;
  source: "post_caption" | "post_media";
  fileName?: string;
  mediaType?: "image" | "video";
  categories: Categories;
}): Promise<void> {
  try {
    const { error } = await moderationClient().from("automated_moderation_audit").insert({
      user_id: input.userId,
      source: input.source,
      file_name: input.fileName ?? null,
      media_type: input.mediaType ?? null,
      decision: "rejected",
      flagged_categories: input.categories,
      provider: `openai-${MODERATION_MODEL}`,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("Could not save an automated moderation audit entry.", error);
    throw new ModerationUnavailableError("We couldn't save the safety check. Please try again.");
  }
}

async function runOpenAIModeration(
  input: OpenAI.ModerationCreateParams["input"]
): Promise<ModerationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("OpenAI moderation is not configured; bypassing automated moderation in this environment.");
      return null;
    }
    throw new ModerationUnavailableError("Safety checks are not set up yet. Please try again later.");
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 2_500, maxRetries: 0 });
    const response = await client.moderations.create({ model: MODERATION_MODEL, input });
    const result = readModerationResult(response.results[0]);
    if (!result) throw new ModerationUnavailableError("OpenAI returned an invalid moderation response.");
    return result;
  } catch (error) {
    console.error("OpenAI moderation request failed.", error);
    if (error instanceof ModerationUnavailableError) throw error;
    if (process.env.NODE_ENV !== "production") {
      console.warn("Bypassing unavailable OpenAI moderation in this environment.");
      return null;
    }
    throw new ModerationUnavailableError();
  }
}

export async function moderatePostCaption(text: string, userId: string): Promise<void> {
  const caption = text.trim();
  if (!caption) return;

  const keywordFlags = abusiveCaptionCategories(caption);
  if (Object.values(keywordFlags).some(Boolean)) {
    await writeAudit({ userId, source: "post_caption", categories: keywordFlags });
    throw new CommunitySafetyViolationError(SAFE_CAPTION_MESSAGE);
  }

  const result = await runOpenAIModeration([{ type: "text", text: caption }]);
  if (result && (result.flagged || Object.values(result.categories).some(Boolean))) {
    await writeAudit({ userId, source: "post_caption", categories: result.categories });
    throw new CommunitySafetyViolationError(SAFE_CAPTION_MESSAGE);
  }
}

async function moderateImages(
  images: Array<{ buffer: Buffer; mimeType: string }>,
  text: string,
  video?: Pick<ProcessedVideo, "durationSeconds" | "width" | "height">
): Promise<ModerationResult | null> {
  const input: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];
  if (text.trim()) input.push({ type: "text", text: text.trim() });
  if (video) {
    input.push({
      type: "text",
      text: `Uploaded video metadata: duration ${video.durationSeconds.toFixed(2)} seconds, ${video.width} by ${video.height} pixels.`,
    });
  }
  for (const image of images) {
    input.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}` },
    });
  }
  return runOpenAIModeration(input);
}

export async function moderateUploadedMedia(
  file: File,
  userId: string,
  caption = "",
  video?: ProcessedVideo
): Promise<void> {
  const isVideo = file.type.startsWith("video/");
  if (isVideo && !video) {
    throw new ModerationUnavailableError("Video metadata could not be checked. Please try again.");
  }
  const images = isVideo
    ? [{ buffer: video!.thumbnail, mimeType: "image/jpeg" }]
    : [{ buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type }];

  const result = await moderateImages(images, caption, video);
  if (result && (result.flagged || Object.values(result.categories).some(Boolean))) {
    await writeAudit({
      userId,
      source: "post_media",
      fileName: file.name,
      mediaType: isVideo ? "video" : "image",
      categories: result.categories,
    });
    throw new CommunitySafetyViolationError(isVideo ? SAFE_VIDEO_MESSAGE : SAFE_UPLOAD_MESSAGE);
  }
}
