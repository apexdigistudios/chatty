import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { CLOUDFLARE_MEDIA_ORIGIN } from "@/lib/mediaUrl";

type UploadFile = File | Buffer;

function getR2Config() {
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  if (!bucketName || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("Cloudflare R2 is not fully configured.");
  }
  return { bucketName, accessKeyId, secretAccessKey, endpoint };
}

function createR2Client(endpoint: string, accessKeyId: string, secretAccessKey: string): S3Client {
  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function objectUrl(key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${CLOUDFLARE_MEDIA_ORIGIN}/${encodedKey}`;
}

export async function uploadToR2(
  file: UploadFile,
  fileName: string,
  contentType: string,
  folder?: string
): Promise<string> {
  const config = getR2Config();
  const safeName = fileName
    .split("/")
    .map((part) => {
      const safePart = part.replace(/[^a-zA-Z0-9._-]/g, "_");
      return safePart === "." || safePart === ".." ? "_" : safePart;
    })
    .filter(Boolean)
    .join("/");
  if (!safeName) throw new Error("A valid R2 object name is required.");

  const safeFolder = folder
    ?.split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .filter(Boolean)
    .join("/");
  if (folder && (!safeFolder || safeFolder.split("/").some((part) => part === "." || part === ".."))) {
    throw new Error("A valid R2 folder is required.");
  }
  const key = `${safeFolder ? `${safeFolder}/` : ""}${Date.now()}-${randomUUID()}/${safeName}`;
  const body = Buffer.isBuffer(file) ? file : Buffer.from(await file.arrayBuffer());
  const client = createR2Client(config.endpoint, config.accessKeyId, config.secretAccessKey);
  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return objectUrl(key);
}

export async function deleteFromR2(key: string): Promise<void> {
  const config = getR2Config();
  const client = createR2Client(config.endpoint, config.accessKeyId, config.secretAccessKey);
  await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}
