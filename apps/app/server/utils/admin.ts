import type { H3Event } from 'h3'

const DEFAULT_ALLOWED_EMAILS = ['developments@sensusinvista.ltd']

function getAllowedEmails(): string[] {
  const configured = process.env.AUTHORIZED_USER_EMAILS || process.env.NUXT_AUTHORIZED_USER_EMAILS
  return (configured || DEFAULT_ALLOWED_EMAILS.join(','))
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
}

export async function requireAuthorizedUser(event: H3Event) {
  const { user } = await requireUserSession(event)
  const allowedEmails = getAllowedEmails()
  const email = user.email?.toLowerCase()

  if (!email || !allowedEmails.includes(email)) {
    throw createError({
      statusCode: 403,
      message: 'Access restricted',
      data: {
        why: 'Acuity.Agent is currently restricted to approved development users',
        fix: 'Sign in with an approved account or ask an administrator to add your email to AUTHORIZED_USER_EMAILS',
      },
    })
  }

  return { user }
}

export async function requireAdmin(event: H3Event) {
  const { user } = await requireAuthorizedUser(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Admin access required', data: { why: 'This endpoint requires the admin role', fix: 'Contact an administrator to be granted access' } })
  }
  return { user }
}
