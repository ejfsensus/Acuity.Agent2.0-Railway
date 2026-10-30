import { isAcuityLoginConfigured, isLocalLoginEnabled, isPublicSignupEnabled } from '../utils/access-policy'

export default defineEventHandler(() => ({
  publicSignupEnabled: isPublicSignupEnabled(),
  acuityLoginEnabled: isAcuityLoginConfigured(),
  localLoginEnabled: isLocalLoginEnabled(),
}))
