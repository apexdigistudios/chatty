import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const MODERATION_URL = "https://api.openai.com/v1/moderations";
const MODERATION_MODEL = "omni-moderation-latest";
const SAFE_UPLOAD_MESSAGE =
  "Oops! That image or video goes against our community safety rules. Please upload a friendly, safe-for-school file.";
const SAFE_CAPTION_MESSAGE =
  "Please change your caption so it follows our community safety rules.";

type Categories = Record<string, boolean>;

interface ModerationResult {
  flagged: boolean;
  categories: Categories;
}

interface OpenAIModerationResponse {
  results: ModerationResult[];
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

async function runOpenAIModeration(input: Array<Record<string, unknown>>): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ModerationUnavailableError("Safety checks are not set up yet. Please try again later.");
  }

  let response: Response;
  try {
    response = await fetch(MODERATION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODERATION_MODEL, input }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    console.error("OpenAI moderation request failed.", error);
    throw new ModerationUnavailableError();
  }

  if (!response.ok) {
    console.error("OpenAI moderation returned an unsuccessful response.", response.status);
    throw new ModerationUnavailableError();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ModerationUnavailableError();
  }
  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw new ModerationUnavailableError();
  }
  const result = readModerationResult(body.results[0]);
  if (!result) throw new ModerationUnavailableError();
  return result;
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
  if (result.flagged || Object.values(result.categories).some(Boolean)) {
    await writeAudit({ userId, source: "post_caption", categories: result.categories });
    throw new CommunitySafetyViolationError(SAFE_CAPTION_MESSAGE);
  }
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      process.kill();
      reject(new Error(`${path.basename(command)} timed out.`));
    }, timeoutMs);

    process.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    process.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    process.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${path.basename(command)} exited with code ${code}: ${stderr}`));
    });
  });
}

async function extractVideoFrames(file: File): Promise<{ directory: string; frames: Buffer[] }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gistme-moderation-"));
  try {
    const videoPath = path.join(directory, "upload");
    await writeFile(videoPath, Buffer.from(await file.arrayBuffer()));
    const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    const durationOutput = await runCommand(
      ffprobe,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath],
      20_000
    );
    const duration = Number.parseFloat(durationOutput);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Could not read the uploaded video's duration.");
    }

    const frames: Buffer[] = [];
    for (const [index, portion] of [0.25, 0.5, 0.75].entries()) {
      const framePath = path.join(directory, `frame-${index}.jpg`);
      await runCommand(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          String(duration * portion),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          "-y",
          framePath,
        ],
        25_000
      );
      frames.push(await readFile(framePath));
    }
    return { directory, frames };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    console.warn("Video moderation could not extract key frames; upload is blocked.", error);
    throw new ModerationUnavailableError(
      "We couldn't check this video safely. Please try again later or upload a photo."
    );
  }
}

async function moderateImages(
  images: Array<{ buffer: Buffer; mimeType: string }>,
  text: string
): Promise<ModerationResult> {
  const input: Array<Record<string, unknown>> = [];
  if (text.trim()) input.push({ type: "text", text: text.trim() });
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
  caption = ""
): Promise<void> {
  const isVideo = file.type.startsWith("video/");
  let framesDirectory: string | null = null;
  try {
    const images = isVideo
      ? await extractVideoFrames(file).then(({ directory, frames }) => {
          framesDirectory = directory;
          return frames.map((buffer) => ({ buffer, mimeType: "image/jpeg" }));
        })
      : [{ buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type }];

    const results: ModerationResult[] = [];
    for (const image of images) {
      results.push(await moderateImages([image], caption));
      const result = results.at(-1)!;
      if (result.flagged || Object.values(result.categories).some(Boolean)) {
        const categories = Object.assign({}, ...results.map((item) => item.categories));
        await writeAudit({
          userId,
          source: "post_media",
          fileName: file.name,
          mediaType: isVideo ? "video" : "image",
          categories,
        });
        throw new CommunitySafetyViolationError();
      }
    }
  } finally {
    if (framesDirectory) {
      await rm(framesDirectory, { recursive: true, force: true }).catch((error: unknown) => {
        console.error("Could not clean temporary video moderation files.", error);
      });
    }
  }
}
