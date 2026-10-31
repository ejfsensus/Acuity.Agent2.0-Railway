/** Ends the Agent session, then the Acuity sign-in session (single sign-out). */
export function useSignOutEverywhere() {
  const { signOut } = useUserSession()
  return async () => {
    await signOut()
    const policy = await $fetch<{ acuitySignOutUrl?: string | null }>('/api/access-policy').catch(() => null)
    const back = `${window.location.origin}/login`
    const target = policy?.acuitySignOutUrl ? `${policy.acuitySignOutUrl}?return=${encodeURIComponent(back)}` : '/login'
    await navigateTo(target, { replace: true, external: true })
  }
}
