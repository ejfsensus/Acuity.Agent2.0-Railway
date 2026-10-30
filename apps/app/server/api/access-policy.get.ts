import { isPublicSignupEnabled } from '../utils/access-policy'

export default defineEventHandler(() => ({ publicSignupEnabled: isPublicSignupEnabled() }))
