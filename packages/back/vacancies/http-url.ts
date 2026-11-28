/** Solo http/https (REQ-007): `javascript:`, `data:`, `file:` y similares se rechazan. */
export function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
