import { S3Client } from '@aws-sdk/client-s3';

let s3ClientInstance: S3Client | null = null;

export function getR2Client(): S3Client {
  if (s3ClientInstance) return s3ClientInstance;
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  s3ClientInstance = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
      secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
    },
  });
  return s3ClientInstance;
}

export function getR2PublicUrl(key: string): string {
  const rawPublicUrl = (process.env.R2_PUBLIC_CUSTOM_DOMAIN || process.env.R2_PUBLIC_URL || '').trim();
  const cleanKey = key.replace(/^\/+/, '');

  if (rawPublicUrl) {
    const formattedBase = rawPublicUrl.startsWith('http://') || rawPublicUrl.startsWith('https://')
      ? rawPublicUrl
      : `https://${rawPublicUrl}`;
    return `${formattedBase.replace(/\/+$/, '')}/${cleanKey}`;
  }

  const bucket = (process.env.R2_BUCKET_NAME || 'thumbnails').trim();
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  if (accountId) {
    return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${cleanKey}`;
  }
  return `https://${bucket}.r2.cloudflarestorage.com/${cleanKey}`;
}
