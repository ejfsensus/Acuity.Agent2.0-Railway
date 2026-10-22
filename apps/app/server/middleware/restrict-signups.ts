export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/auth/sign-up')) return

  throw createError({
    statusCode: 403,
    message: 'Sign ups are disabled',
    data: {
      why: 'Acuity.Agent is restricted to approved development users while in development',
      fix: 'Ask the administrator to create or approve your account',
    },
  })
})
