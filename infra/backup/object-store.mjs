import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const [, , command, ...rawArgs] = process.argv;
const args = Object.fromEntries(
  rawArgs.flatMap((value, index) =>
    value.startsWith('--') ? [[value.slice(2), rawArgs[index + 1]]] : [],
  ),
);

const required = (name) => {
  const value = args[name];
  if (!value) throw new Error(`Argument requis : --${name}`);
  return value;
};

const endpoint = required('endpoint');
const bucket = required('bucket');
const accessKeyId = process.env.CSB_S3_ACCESS_KEY;
const secretAccessKey = process.env.CSB_S3_SECRET_KEY;
if (!accessKeyId || !secretAccessKey) {
  throw new Error('CSB_S3_ACCESS_KEY et CSB_S3_SECRET_KEY sont requis.');
}

const client = new S3Client({
  endpoint,
  region: args.region ?? 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

async function listObjects(bucketName) {
  const objects = [];
  let continuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucketName, ContinuationToken: continuationToken }),
    );
    objects.push(...(page.Contents ?? []));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects.sort((left, right) => (left.Key ?? '').localeCompare(right.Key ?? ''));
}

async function createBucket(bucketName) {
  await client.send(new CreateBucketCommand({ Bucket: bucketName }));
}

async function backup() {
  const directory = path.resolve(required('directory'));
  await mkdir(directory);
  await mkdir(path.join(directory, 'blobs'));
  const listed = await listObjects(bucket);
  const objects = [];
  for (const [index, item] of listed.entries()) {
    const key = item.Key;
    if (!key) continue;
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!(response.Body instanceof Readable)) throw new Error(`Corps illisible pour ${key}`);
    const blob = `${String(index).padStart(8, '0')}.bin`;
    const blobPath = path.join(directory, 'blobs', blob);
    await pipeline(response.Body, (await import('node:fs')).createWriteStream(blobPath));
    const bytes = await readFile(blobPath);
    objects.push({
      key,
      blob,
      size_bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      content_type: response.ContentType ?? null,
      metadata: response.Metadata ?? {},
    });
  }
  const manifest = {
    format_version: 1,
    source_bucket: bucket,
    objects,
    object_count: objects.length,
    size_bytes: objects.reduce((sum, item) => sum + item.size_bytes, 0),
  };
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function restore() {
  const directory = path.resolve(required('directory'));
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format_version !== 1)
    throw new Error('Version de manifeste fichiers non prise en charge.');
  await createBucket(bucket);
  for (const object of manifest.objects) {
    const blobPath = path.join(directory, 'blobs', object.blob);
    const bytes = await readFile(blobPath);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (checksum !== object.sha256 || bytes.length !== object.size_bytes) {
      throw new Error(`Objet de sauvegarde corrompu : ${object.key}`);
    }
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: object.key,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: object.content_type ?? undefined,
        Metadata: object.metadata,
      }),
    );
  }
  return stats();
}

async function stats() {
  const objects = await listObjects(bucket);
  return {
    bucket,
    object_count: objects.length,
    size_bytes: objects.reduce((sum, item) => sum + Number(item.Size ?? 0), 0),
  };
}

async function deleteBucket() {
  const objects = await listObjects(bucket);
  for (let index = 0; index < objects.length; index += 1000) {
    const batch = objects.slice(index, index + 1000);
    if (batch.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((item) => ({ Key: item.Key })) },
        }),
      );
    }
  }
  await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  return { deleted: bucket };
}

async function putFile() {
  const file = path.resolve(required('file'));
  const key = required('key');
  const bytes = await readFile(file);
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.length }),
  );
  return { bucket, key, size_bytes: bytes.length };
}

const operations = {
  'create-bucket': () => createBucket(bucket).then(() => ({ created: bucket })),
  backup,
  restore,
  stats,
  'delete-bucket': deleteBucket,
  'put-file': putFile,
};

if (!operations[command]) throw new Error(`Commande inconnue : ${command}`);
console.log(JSON.stringify(await operations[command]()));
