import { spawn } from "node:child_process";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ProcessedVideo {
  durationSeconds: number;
  width: number;
  height: number;
  thumbnail: Buffer;
  tempDirectory: string;
  tempFiles: string[];
}

export class VideoProcessingError extends Error {
  constructor(message = "We couldn't process this video. Please try a different file.") {
    super(message);
    this.name = "VideoProcessingError";
  }
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(command)} timed out.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-3000);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${path.basename(command)} exited with code ${code}: ${stderr}`));
    });
  });
}

async function removeTemporaryFiles(directory: string, files: string[]): Promise<void> {
  await Promise.all(files.map(async (file) => {
    try {
      await unlink(file);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }));
  await rmdir(directory);
}

export async function cleanupProcessedVideo(video: ProcessedVideo): Promise<void> {
  try {
    await removeTemporaryFiles(video.tempDirectory, video.tempFiles);
  } catch (error) {
    console.error("Could not clean temporary video processing files.", error);
  }
}

export async function processVideo(file: File): Promise<ProcessedVideo> {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "chatty-video-"));
  const tempFiles = [path.join(tempDirectory, "source"), path.join(tempDirectory, "thumbnail.jpg")];
  try {
    const [{ default: ffmpegInstaller }, { default: ffprobeInstaller }] = await Promise.all([
      import("@ffmpeg-installer/ffmpeg"),
      import("@ffprobe-installer/ffprobe"),
    ]);
    const [sourcePath, thumbnailPath] = tempFiles as [string, string];
    await writeFile(sourcePath, Buffer.from(await file.arrayBuffer()));
    const probeOutput = await runCommand(
      ffprobeInstaller.path,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height", "-of", "json", sourcePath],
      4_000
    );
    const probe: unknown = JSON.parse(probeOutput);
    if (!probe || typeof probe !== "object" || !("format" in probe) || !("streams" in probe)) {
      throw new Error("The video metadata was invalid.");
    }
    const format = probe.format;
    const streams = probe.streams;
    if (!format || typeof format !== "object" || !("duration" in format) ||
      typeof format.duration !== "string" ||
      !Array.isArray(streams) || !streams[0] || typeof streams[0] !== "object" ||
      !("width" in streams[0]) || !("height" in streams[0]) ||
      typeof streams[0].width !== "number" || typeof streams[0].height !== "number") {
      throw new Error("The video metadata was incomplete.");
    }
    const durationSeconds = Number.parseFloat(format.duration);
    const width = streams[0].width;
    const height = streams[0].height;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || width <= 0 || height <= 0) {
      throw new Error("The video dimensions or duration were invalid.");
    }

    await runCommand(
      ffmpegInstaller.path,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(Math.min(0.5, durationSeconds / 10)),
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "4",
        "-y",
        thumbnailPath,
      ],
      5_000
    );
    const thumbnail = await readFile(thumbnailPath);
    if (thumbnail.length === 0) throw new Error("FFmpeg produced an empty thumbnail.");
    return { durationSeconds, width, height, thumbnail, tempDirectory, tempFiles };
  } catch (error) {
    try {
      await removeTemporaryFiles(tempDirectory, tempFiles);
    } catch (cleanupError) {
      console.error("Could not clean temporary video files after processing failed.", cleanupError);
    }
    console.error("Video metadata or thumbnail extraction failed.", error);
    throw new VideoProcessingError();
  }
}
