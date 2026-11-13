import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, ObjectIdentifier } from '@aws-sdk/client-s3';

const supabaseS3 = new S3Client({
  region: process.env.SUPABASE_S3_REGION || 'us-east-1',
  endpoint: process.env.SUPABASE_S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY || '',
  },
});

const BUCKETS = ['avatars', 'posts', 'media'];

async function emptyBuckets() {
  for (const bucket of BUCKETS) {
    console.log(`🧹 Emptying Supabase bucket: ${bucket}...`);
    let continuationToken: string | undefined = undefined;

    do {
      const listCmd: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      });

      const listed = await supabaseS3.send(listCmd);

      if (!listed.Contents || listed.Contents.length === 0) {
        console.log(`Bucket ${bucket} is clean.`);
        break;
      }

      const objectsToDelete: ObjectIdentifier[] = listed.Contents
        .filter((file) => Boolean(file.Key))
        .map((file) => ({ Key: file.Key! }));

      if (objectsToDelete.length > 0) {
        const deleteCmd = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objectsToDelete },
        });

        await supabaseS3.send(deleteCmd);
        console.log(`Deleted ${objectsToDelete.length} files from ${bucket}`);
      }

      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);
  }

  console.log('All targeted Supabase buckets emptied successfully!');
}

emptyBuckets().catch((err) => {
  console.error('❌ Error emptying buckets:', err);
});