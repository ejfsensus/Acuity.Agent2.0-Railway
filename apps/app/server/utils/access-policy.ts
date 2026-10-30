export function isPublicSignupEnabled(): boolean {
  return process.env.PUBLIC_SIGNUP_ENABLED === 'true'
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email?.trim()) return false
  if (isPublicSignupEnabled()) return true
  const configured = process.env.AUTHORIZED_USER_EMAILS || process.env.NUXT_AUTHORIZED_USER_EMAILS || 'developments@sensusinvista.ltd'
  return configured.split(',').some(allowed => allowed.trim().toLowerCase() === email.trim().toLowerCase())
}
