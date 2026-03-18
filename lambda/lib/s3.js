import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client();
const BUCKET = process.env.S3_BUCKET_NAME;

export const uploadToS3 = async (buffer, key, contentType = 'image/png') => {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
};

export const getPresignedUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
};

export const deleteFromS3 = async (key) => {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
};

export const buildImageKey = (userId, bookId, pageId, attemptNumber) =>
  `users/${userId}/books/${bookId}/pages/${pageId}/attempt-${attemptNumber}.png`;

export const buildCoverKey = (userId, bookId, attemptNumber) =>
  `users/${userId}/books/${bookId}/cover/attempt-${attemptNumber}.png`;
