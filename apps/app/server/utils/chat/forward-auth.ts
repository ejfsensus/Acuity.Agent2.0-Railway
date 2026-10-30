/** Preserve the incoming identity for calls back to this app's protected tools. */
export function forwardAuthHeaders(incoming: Record<string, string | string[] | undefined>): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of ['cookie', 'authorization', 'x-api-key']) {
    const value = incoming[name]
    if (typeof value === 'string' && value) headers[name] = value
  }
  return headers
}
