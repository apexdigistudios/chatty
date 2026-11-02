/** Lightweight video metadata + optional client-side trimming for status posts. */

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export function isVideoMime(type: string): boolean {
  return type === "video/mp4" || type === "video/webm" || type === "video/quicktime" || type.startsWith("video/");
}

export function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const metadata = {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      URL.revokeObjectURL(url);
      if (metadata.duration <= 0) reject(new Error("Could not read that video's duration."));
      else resolve(metadata);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This video format cannot be previewed in your browser."));
    };
    video.src = url;
  });
}

/**
 * Trims a video in the browser with MediaRecorder. No ffmpeg download required.
 * Returns a new WebM File, or throws when the browser lacks captureStream support.
 */
export async function trimVideoFile(file: File, startSeconds: number, endSeconds: number): Promise<File> {
  if (endSeconds - startSeconds < 0.4) throw new Error("Trim at least 0.4 seconds of video.");
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  const streamFactory = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
  if (typeof MediaRecorder === "undefined" || typeof streamFactory !== "function") {
    URL.revokeObjectURL(url);
    throw new Error("Video trimming is not supported in this browser. Your original video is unchanged.");
  }

  const stream = streamFactory.call(video);
  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) {
    stream.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(url);
    throw new Error("This browser cannot encode trimmed video.");
  }

  return new Promise<File>((resolve, reject) => {
    let recorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];
    let finished = false;
    let started = false;

    const cleanup = () => {
      video.pause();
      video.removeAttribute("src");
      stream.getTracks().forEach((track) => track.stop());
      URL.revokeObjectURL(url);
    };

    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(message));
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = async () => {
      try {
        const start = Math.max(0, Math.min(startSeconds, video.duration - 0.1));
        const end = Math.min(endSeconds, video.duration);
        if (end - start < 0.4) {
          fail("Trim at least 0.4 seconds of video.");
          return;
        }
        recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => fail("Video trimming failed. Try another clip.");
        recorder.onstop = () => {
          if (finished) return;
          finished = true;
          const blob = new Blob(chunks, { type: "video/webm" });
          cleanup();
          resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-trim.webm`, { type: "video/webm" }));
        };
        const startRecording = async () => {
          if (!recorder || started) return;
          started = true;
          recorder.start(200);
          await video.play();
        };
        video.onseeked = startRecording;
        video.ontimeupdate = () => {
          if (recorder && video.currentTime >= end) {
            video.pause();
            if (recorder.state !== "inactive") recorder.stop();
          }
        };
        video.currentTime = start;
        if (start === 0) void startRecording();
        // Guard against stalled decoder / mobile power saving.
        window.setTimeout(() => {
          if (!finished && recorder && recorder.state !== "inactive") {
            video.pause();
            recorder.stop();
          }
        }, Math.ceil((end - start + 2) * 1000));
      } catch {
        fail("Video trimming failed. Try another clip.");
      }
    };
    video.onerror = () => fail("Could not decode this video for trimming.");
    video.src = url;
  });
}

export function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
