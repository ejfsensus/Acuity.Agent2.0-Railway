import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

/**
 * S3-compatible object storage shim matching the NuxtHub `hub:blob` surface
 * (put/get/del/list) so call sites did not have to change when storage moved
 * from Vercel Blob to a Railway Bucket.
 */

export interface BlobDescriptor {
  url: string
  pathname: string
  contentType: string
  contentDisposition: string
}

export interface BlobListItem {
  url: string
  pathname: string
  contentType: string
  size: number
  uploadedAt: string
}

export interface PutBlobOptions {
  contentType?: string
  addRandomSuffix?: boolean
}

export interface ListBlobOptions {
  prefix?: string
  limit?: number
  cursor?: string
}

function env(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

function getConfig() {
  return {
    endpoint: env('AWS_ENDPOINT_URL', 'BUCKET_ENDPOINT_URL', 'S3_ENDPOINT_URL'),
    region: env('AWS_REGION', 'BUCKET_REGION', 'S3_REGION') || 'auto',
    bucket: env('AWS_BUCKET_NAME', 'BUCKET_NAME', 'S3_BUCKET_NAME'),
    accessKeyId: env('AWS_ACCESS_KEY_ID', 'BUCKET_ACCESS_KEY_ID'),
    secretAccessKey: env('AWS_SECRET_ACCESS_KEY', 'BUCKET_SECRET_ACCESS_KEY'),
  }
}

let client: S3Client | undefined

function s3(): S3Client {
  const { endpoint, region, accessKeyId, secretAccessKey } = getConfig()

  if (!client) {
    client = new S3Client({
      region,
      endpoint,
      // Railway Bucket exposes a path-style S3 endpoint, not virtual-host DNS.
      forcePathStyle: true,
      credentials: accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    })
  }

  return client
}

function requireBucket(): string {
  const { bucket } = getConfig()
  if (!bucket) {
    throw new Error('Object storage is not configured: set AWS_BUCKET_NAME and AWS_ENDPOINT_URL')
  }
  return bucket
}

function normalize(pathname: string): string {
  return pathname.replace(/^\/+/, '')
}

/** Vercel Blob appends a random suffix unless explicitly disabled; callers rely on the returned pathname. */
function applyRandomSuffix(pathname: string): string {
  const suffix = Math.random().toString(36).slice(2, 10)
  const dot = pathname.lastIndexOf('.')
  const slash = pathname.lastIndexOf('/')

  if (dot > slash + 1) {
    return `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`
  }
  return `${pathname}-${suffix}`
}

function toBody(data: unknown): Uint8Array | string {
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return String(data)
}

async function put(pathname: string, data: unknown, options: PutBlobOptions = {}): Promise<BlobDescriptor> {
  const Bucket = requireBucket()
  const Key = normalize(options.addRandomSuffix === false ? pathname : applyRandomSuffix(normalize(pathname)))
  const ContentType = options.contentType || 'application/octet-stream'

  await s3().send(new PutObjectCommand({
    Bucket,
    Key,
    Body: toBody(data),
    ContentType,
  }))

  return {
    url: Key,
    pathname: Key,
    contentType: ContentType,
    contentDisposition: `attachment; filename="${Key.split('/').pop() || Key}"`,
  }
}

async function get(pathname: string): Promise<Response | null> {
  const Bucket = requireBucket()
  const Key = normalize(pathname)

  try {
    const object = await s3().send(new GetObjectCommand({ Bucket, Key }))
    const body = object.Body
    if (!body) return null

    const bytes = await body.transformToByteArray()
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': object.ContentType || 'application/octet-stream',
        'content-length': String(object.ContentLength ?? bytes.byteLength),
      },
    })
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

async function head(pathname: string): Promise<BlobListItem | null> {
  const Bucket = requireBucket()
  const Key = normalize(pathname)

  try {
    const meta = await s3().send(new HeadObjectCommand({ Bucket, Key }))
    return {
      url: Key,
      pathname: Key,
      contentType: meta.ContentType || 'application/octet-stream',
      size: meta.ContentLength ?? 0,
      uploadedAt: (meta.LastModified ?? new Date()).toISOString(),
    }
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

async function del(pathname: string | string[]): Promise<void> {
  const Bucket = requireBucket()
  const keys = (Array.isArray(pathname) ? pathname : [pathname]).map(p => ({ Key: normalize(p) }))
  if (keys.length === 0) return

  if (keys.length === 1) {
    await s3().send(new DeleteObjectCommand({ Bucket, Key: keys[0]!.Key }))
    return
  }

  await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }))
}

async function list(options: ListBlobOptions = {}): Promise<{ blobs: BlobListItem[], cursor?: string }> {
  const Bucket = requireBucket()

  const response = await s3().send(new ListObjectsV2Command({
    Bucket,
    Prefix: options.prefix ? normalize(options.prefix) : undefined,
    MaxKeys: options.limit,
    ContinuationToken: options.cursor,
  }))

  const blobs: BlobListItem[] = (response.Contents ?? []).map((object) => {
    const Key = object.Key ?? ''
    return {
      url: Key,
      pathname: Key,
      contentType: 'application/octet-stream',
      size: object.Size ?? 0,
      uploadedAt: (object.LastModified ?? new Date()).toISOString(),
    }
  })

  return {
    blobs,
    cursor: response.IsTruncated ? response.NextContinuationToken : undefined,
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string, $metadata?: { httpStatusCode?: number } })?.name
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404
}

export const blob = { put, get, head, del, list }
