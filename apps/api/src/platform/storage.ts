import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from './config.js';

/**
 * Stockage objet S3-compatible (ADR-007).
 *
 * Règle : AUCUN objet n'est public. Les fichiers (justificatifs de paiement,
 * photos d'élèves, reçus PDF) ne sont accessibles que par URL pré-signée à
 * durée courte, générée après contrôle de permission.
 */

/** Durée de vie par défaut d'une URL pré-signée. Courte, volontairement. */
export const PRESIGNED_URL_TTL_SECONDS = 300;

export interface Storage {
  readonly bucket: string;
  putObject(params: {
    key: string;
    body: Buffer | Uint8Array | string;
    contentType: string;
  }): Promise<void>;
  getDownloadUrl(key: string, ttlSeconds?: number): Promise<string>;
  getUploadUrl(params: { key: string; contentType: string; ttlSeconds?: number }): Promise<string>;
  deleteObject(key: string): Promise<void>;
  ping(): Promise<void>;
}

export function createStorage(config: AppConfig): Storage {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });

  const bucket = config.S3_BUCKET;

  return {
    bucket,

    async putObject({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async getDownloadUrl(key, ttlSeconds = PRESIGNED_URL_TTL_SECONDS) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: ttlSeconds,
      });
    },

    async getUploadUrl({ key, contentType, ttlSeconds = PRESIGNED_URL_TTL_SECONDS }) {
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
        { expiresIn: ttlSeconds },
      );
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async ping() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}
