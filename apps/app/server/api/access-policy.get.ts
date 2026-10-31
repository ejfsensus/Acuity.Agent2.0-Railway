import { isAcuityLoginConfigured, isLocalLoginEnabled, isPublicSignupEnabled } from '../utils/access-policy'

export default defineEventHandler(() => ({
  publicSignupEnabled: isPublicSignupEnabled(),
  acuityLoginEnabled: isAcuityLoginConfigured(),
  localLoginEnabled: isLocalLoginEnabled(),
  // Single sign-out page of the Acuity identity provider (origin + /sign-out).
  acuitySignOutUrl: acuitySignOutUrl(),
}))

function acuitySignOutUrl(): string | null {
  if (!isAcuityLoginConfigured()) return null
  try {
    return `${new URL(process.env.ACUITY_OIDC_ISSUER!.trim()).origin}/sign-out`
  } catch {
    return null
  }
}
