export function isPublicSignupEnabled(): boolean {
  return process.env.PUBLIC_SIGNUP_ENABLED === 'true'
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email?.trim()) return false
  if (isPublicSignupEnabled()) return true
  const configured = process.env.AUTHORIZED_USER_EMAILS || process.env.NUXT_AUTHORIZED_USER_EMAILS || 'developments@sensusinvista.ltd'
  return configured.split(',').some(allowed => allowed.trim().toLowerCase() === email.trim().toLowerCase())
}

/** Unified login through the Acuity identity provider (auth.acuity.institute). */
export function isAcuityLoginConfigured(): boolean {
  return Boolean(
    process.env.ACUITY_OIDC_ISSUER?.trim()
    && process.env.ACUITY_OIDC_CLIENT_ID?.trim()
    && process.env.ACUITY_OIDC_CLIENT_SECRET?.trim(),
  )
}

/**
 * Email/password sign-in stays on as a fallback unless explicitly disabled,
 * and is never disabled while no identity provider is configured (lockout guard).
 */
export function isLocalLoginEnabled(): boolean {
  const raw = (process.env.AUTH_LOCAL_LOGIN_ENABLED || '').trim().toLowerCase()
  const disabled = raw === 'false' || raw === '0' || raw === 'off' || raw === 'no'
  return !disabled || !isAcuityLoginConfigured()
}

/**
 * Policy for a brand-new user arriving through the Acuity identity provider:
 * the IdP must assert a verified email, and the address must pass the same
 * allowlist as every other sign-in (AUTHORIZED_USER_EMAILS unless public sign-up).
 */
export function acuityOidcSignupError(user: { email?: unknown, emailVerified?: unknown }): string | null {
  if (user.emailVerified !== true) return 'Your Acuity account email is not verified yet.'
  if (!isEmailAllowed(typeof user.email === 'string' ? user.email : '')) return 'This account is not approved for Acuity.Agent yet.'
  return null
}
