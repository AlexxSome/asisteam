import { Inject, Injectable, ServiceUnavailableException, type OnApplicationShutdown } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, GetBucketAclCommand, GetBucketPolicyCommand, GetBucketOwnershipControlsCommand, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { avatarContentType, avatarFileSchema, AVATAR_MAX_BYTES } from '@asisteam/core/runtime';
import { CONFIG, type RuntimeConfig } from './config.js';

export const AVATAR_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function validateAvatar(bytes: Uint8Array, type: string) {
  if (!avatarFileSchema.safeParse({ size: bytes.length, type }).success || avatarContentType(bytes) !== type) throw new Error('invalid_avatar');
}
@Injectable()
export class AvatarStorage implements OnApplicationShutdown {
  readonly client: S3Client | undefined;
  readonly bucket: string | undefined;
  private readonly localPolicyOnly: boolean;
  constructor(@Inject(CONFIG) config: RuntimeConfig) {
    this.bucket = config.S3_AVATAR_BUCKET;
    this.localPolicyOnly = config.S3_LOCAL_POLICY_ONLY === '1';
    if (this.bucket) this.client = new S3Client({ region: config.S3_REGION, endpoint: config.S3_ENDPOINT, forcePathStyle: !!config.S3_ENDPOINT,
      maxAttempts: 1, requestHandler: { requestTimeout: config.HTTP_TIMEOUT_MS },
      ...(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY ? { credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY } } : {}) });
  }
  private object(key: string) {
    if (!this.client || !this.bucket) throw new ServiceUnavailableException();
    if (!AVATAR_KEY.test(key)) throw new Error('invalid_avatar_key');
    return { Bucket: this.bucket, Key: key };
  }
  async assertPrivate() {
    if (!this.client || !this.bucket) throw new ServiceUnavailableException();
    try {
      if (!this.localPolicyOnly) {
        const [acl, ownership, blocking] = await Promise.all([
          this.client.send(new GetBucketAclCommand({ Bucket: this.bucket })),
          this.client.send(new GetBucketOwnershipControlsCommand({ Bucket: this.bucket })),
          this.client.send(new GetPublicAccessBlockCommand({ Bucket: this.bucket })),
        ]);
        const flags = blocking.PublicAccessBlockConfiguration;
        if (!acl.Owner?.ID || !acl.Grants?.length || acl.Grants.some(grant => grant.Grantee?.Type !== 'CanonicalUser' || grant.Grantee.ID !== acl.Owner!.ID)
          || ownership.OwnershipControls?.Rules?.length !== 1 || ownership.OwnershipControls.Rules[0]?.ObjectOwnership !== 'BucketOwnerEnforced'
          || !flags?.BlockPublicAcls || !flags.IgnorePublicAcls || !flags.BlockPublicPolicy || !flags.RestrictPublicBuckets) throw new Error('bucket_not_private');
      }
      try {
        const policy = await this.client.send(new GetBucketPolicyCommand({ Bucket: this.bucket }));
        const statements = JSON.parse(policy.Policy ?? '{}').Statement;
        if (!Array.isArray(statements) || statements.some((entry: { Effect?: string; Principal?: unknown }) => entry.Effect === 'Allow' && (!entry.Principal || entry.Principal === '*' || typeof entry.Principal === 'object' && JSON.stringify(entry.Principal).includes('"*"')))) throw new Error('bucket_not_private');
      } catch (error) { if (!(error instanceof Error) || error.name !== 'NoSuchBucketPolicy') throw error; }
    } catch { throw new ServiceUnavailableException(); }
  }
  async put(key: string, bytes: Uint8Array, type: string) {
    validateAvatar(bytes, type);
    await this.assertPrivate();
    const object = this.object(key);
    await this.client!.send(new PutObjectCommand({ ...object, Body: bytes, ContentType: type,
      Metadata: { sha256: sha256(bytes) }, IfNoneMatch: '*' }));
  }
  async signedRead(key: string, expiresIn = 30, signingDate?: Date) {
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 30) throw new Error('invalid_expiry');
    return getSignedUrl(this.client!, new GetObjectCommand({ ...this.object(key), ResponseCacheControl: 'private, no-store' }), { expiresIn, ...(signingDate ? { signingDate } : {}) });
  }
  async read(key: string) {
    await this.assertPrivate();
    const object = this.object(key);
    const metadata = await this.client!.send(new HeadObjectCommand(object));
    if (!metadata.ContentLength || metadata.ContentLength > AVATAR_MAX_BYTES || !metadata.ContentType || !/^[0-9a-f]{64}$/.test(metadata.Metadata?.sha256 ?? '')) throw new Error('invalid_avatar_metadata');
    // Signed URLs never leave the server; authorization is checked on each web GET.
    const response = await fetch(await this.signedRead(key), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok || !response.body) throw new Error('avatar_unavailable');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length;
        if (length > AVATAR_MAX_BYTES) throw new Error('avatar_too_large'); chunks.push(next.value); }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    validateAvatar(bytes, metadata.ContentType);
    if (bytes.length !== metadata.ContentLength || sha256(bytes) !== metadata.Metadata?.sha256) throw new Error('avatar_checksum_mismatch');
    return { bytes, type: metadata.ContentType };
  }
  onApplicationShutdown() { this.client?.destroy(); }
}
