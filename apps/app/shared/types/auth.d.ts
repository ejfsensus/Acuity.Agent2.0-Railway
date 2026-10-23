import '#nuxt-better-auth'

declare module '#nuxt-better-auth' {
  interface AuthUser {
    role?: string | null
    username?: string | null
  }
}
