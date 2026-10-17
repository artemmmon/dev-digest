/**
 * A server-supplied link is opened only when it is an https URL: a value like `javascript:…` would run
 * script in this page when clicked. Anything else renders no link.
 */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
