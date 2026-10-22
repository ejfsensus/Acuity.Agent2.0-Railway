import { blob, validateBlobToken } from '../../utils/blob'

export default defineEventHandler(async (event) => {
  const pathname = getRouterParam(event, 'pathname') || ''
  const { token } = getQuery(event)
  if (typeof token !== 'string' || !validateBlobToken(pathname, token)) {
    throw createError({ statusCode: 403, message: 'Invalid file link' })
  }
  const object = await blob.get(pathname)
  if (!object) throw createError({ statusCode: 404, message: 'File not found' })
  object.headers.set('content-security-policy', 'default-src \'none\'; sandbox')
  object.headers.set('x-content-type-options', 'nosniff')
  object.headers.set('cache-control', 'private, no-store')
  const contentType = object.headers.get('content-type') || ''
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(contentType)) {
    object.headers.set('content-disposition', 'attachment')
  }
  return object
})
