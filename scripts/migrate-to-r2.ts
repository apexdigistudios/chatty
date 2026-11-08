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
            const download = await source.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            if (!download.Body) throw new Error("The source object had no content.");

            await destination.send(new PutObjectCommand({
              Bucket: destinationBucket,
              Key: targetKey,
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
            copied += 1;
            console.log(`[${bucket}] Copied ${key} -> ${targetKey}`);
          } catch (error) {
            failed += 1;
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`[${bucket}] Failed ${key}: ${reason}`);
          }
        }

        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
        console.log(`[${bucket}] Progress: ${copied} copied, ${failed} failed.`);
      } while (continuationToken);
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
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
  console.error("R2 migration could not start:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
