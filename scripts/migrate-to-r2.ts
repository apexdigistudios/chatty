import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function sourceBuckets(): string[] {
  const value = process.env.SUPABASE_BUCKET_NAMES ?? process.env.SUPABASE_BUCKET_NAME;
  if (!value?.trim()) {
    throw new Error("Set SUPABASE_BUCKET_NAMES to the three source bucket names, separated by commas.");
  }
  const buckets = value.split(",").map((bucket) => bucket.trim()).filter(Boolean);
  if (buckets.length !== 3 || new Set(buckets).size !== 3) {
    throw new Error("Exactly three distinct Supabase source bucket names are required.");
  }
  if (buckets.some((bucket) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(bucket))) {
    throw new Error("Supabase bucket names must be valid single folder names for R2 prefixes.");
  }
  return buckets;
}

function destinationKey(bucket: string, key: string): string {
  return `${bucket}/${key}`;
}

const MAX_FILE_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function isRetryableNetworkError(error: unknown, seen = new Set<object>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);

  const details = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    $retryable?: unknown;
    $metadata?: { httpStatusCode?: unknown };
    cause?: unknown;
  };
  const code = typeof details.code === "string" ? details.code : "";
  const name = typeof details.name === "string" ? details.name : "";
  const message = typeof details.message === "string" ? details.message : "";
  const status = details.$metadata?.httpStatusCode;

  if (
    details.$retryable ||
    (typeof status === "number" && [408, 429, 500, 502, 503, 504].includes(status)) ||
    /^(ECONNRESET|ETIMEDOUT|ECONNREFUSED|ECONNABORTED|EPIPE|EHOSTUNREACH|EHOSTDOWN|ENETUNREACH|ENOTFOUND|EAI_AGAIN|EAI_FAIL|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|ERR_STREAM_PREMATURE_CLOSE|RequestTimeout|RequestTimeoutException|SlowDown|TimeoutError)$/i.test(code || name) ||
    /socket hang up|network error|network request failed|timed? ?out|stream.*(fail|error|abort|reset|closed)|connection reset|connection.*closed|getaddrinfo/i.test(message)
  ) {
    return true;
  }

  return isRetryableNetworkError(details.cause, seen);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createS3Client(input: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  return new S3Client({
    endpoint: input.endpoint,
    region: input.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
  });
}

async function copyFileWithRetry(input: {
  source: S3Client;
  destination: S3Client;
  sourceBucket: string;
  destinationBucket: string;
  key: string;
  targetKey: string;
}): Promise<void> {
  for (let retry = 0; ; retry += 1) {
    try {
      const download = await input.source.send(new GetObjectCommand({
        Bucket: input.sourceBucket,
        Key: input.key,
      }));
      if (!download.Body) throw new Error("The source object had no content.");

      await input.destination.send(new PutObjectCommand({
        Bucket: input.destinationBucket,
        Key: input.targetKey,
        Body: download.Body,
        ContentLength: download.ContentLength,
        ContentType: download.ContentType,
        CacheControl: download.CacheControl,
        ContentDisposition: download.ContentDisposition,
        ContentEncoding: download.ContentEncoding,
        ContentLanguage: download.ContentLanguage,
        Expires: download.Expires,
        Metadata: download.Metadata,
      }));
      return;
    } catch (error) {
      if (!isRetryableNetworkError(error) || retry >= MAX_FILE_RETRIES) throw error;

      const delay = RETRY_DELAY_MS * 2 ** retry;
      console.warn(
        `[${input.sourceBucket}] Network error copying ${input.key}; retry ${retry + 1}/${MAX_FILE_RETRIES} in ${delay}ms: ${errorMessage(error)}`
      );
      await wait(delay);
    }
  }
}

async function main(): Promise<void> {
  const buckets = sourceBuckets();
  const source = createS3Client({
    endpoint: requiredEnv("SUPABASE_S3_ENDPOINT"),
    region: requiredEnv("SUPABASE_S3_REGION"),
    accessKeyId: requiredEnv("SUPABASE_S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("SUPABASE_S3_SECRET_ACCESS_KEY"),
  });
  const destination = createS3Client({
    endpoint: requiredEnv("CLOUDFLARE_R2_ENDPOINT"),
    region: "auto",
    accessKeyId: requiredEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
  });
  const destinationBucket = requiredEnv("CLOUDFLARE_R2_BUCKET_NAME");
  console.log(`Migrating ${buckets.length} Supabase buckets into the single R2 bucket "${destinationBucket}".`);

  let totalCopied = 0;
  let totalFailed = 0;

  for (const bucket of buckets) {
    console.log(`\nMigrating Supabase bucket "${bucket}" to R2 prefix "${bucket}/" in "${destinationBucket}".`);
    let continuationToken: string | undefined;
    let copied = 0;
    let failed = 0;

    try {
      do {
        const page = await source.send(new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        }));
        const objects = page.Contents ?? [];

        for (const object of objects) {
          const key = object.Key;
          if (!key || key.endsWith("/")) continue;
          const targetKey = destinationKey(bucket, key);

          try {
            await copyFileWithRetry({
              source,
              destination,
              sourceBucket: bucket,
              destinationBucket,
              key,
              targetKey,
            });
            copied += 1;
            console.log(`[${bucket}] Copied ${key} -> ${targetKey}`);
          } catch (error) {
            failed += 1;
            console.warn(`⚠️ Skipped file after retries: ${key} [${bucket}] (${errorMessage(error)})`);
          }
        }

        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
        console.log(`[${bucket}] Progress: ${copied} copied, ${failed} failed.`);
      } while (continuationToken);
    } catch (error) {
      failed += 1;
      const reason = errorMessage(error);
      console.error(`[${bucket}] Could not list source objects: ${reason}`);
    }

    totalCopied += copied;
    totalFailed += failed;
    console.log(`[${bucket}] Finished: ${copied} copied, ${failed} failed.`);
  }

  console.log(`\nMigration finished: ${totalCopied} objects copied, ${totalFailed} failures.`);
  if (totalFailed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("R2 migration could not start:", errorMessage(error));
  process.exitCode = 1;
});
