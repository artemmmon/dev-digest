/**
 * Mirror of the server's `stripImageEmbeds` (the kit Markdown has no `img` override and cannot be changed here):
 * model text never chooses a URL that is fetched: markdown images (`![alt](url)`, `![alt][ref]`)
 * become their alt text and raw `<img>` tags are dropped. Repeats until stable so a tag cannot be
 * rebuilt from the pieces left behind by removing another.
 */
export function stripImageEmbeds(body: string): string {
  let out = body;
  // Every pass that changes the text shortens it, so this ends.
  for (;;) {
    const next = out
      .replace(/!\[([^\]]*)\](?:\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\])?/g, "$1")
      .replace(/<img\b[^>]*>?/gi, "");
    if (next === out) break;
    out = next;
  }
  return out;
}
