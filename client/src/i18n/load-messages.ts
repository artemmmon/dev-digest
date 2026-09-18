import type { AbstractIntlMessages } from "next-intl";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read every `messages/<locale>/<ns>.json` into `{ [ns]: {...} }`. Plain Node, no
 * next-intl server API, so component tests can load the real catalogue too.
 */
const cache = new Map<string, AbstractIntlMessages>();

export function loadMessages(locale: string): AbstractIntlMessages {
  // Production reads the catalogue once per process; dev re-reads so an edited JSON shows up.
  const cached = process.env.NODE_ENV === "production" ? cache.get(locale) : undefined;
  if (cached) return cached;
  const dir = join(process.cwd(), "messages", locale);
  const messages: Record<string, AbstractIntlMessages> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const ns = file.replace(/\.json$/, "");
    messages[ns] = JSON.parse(readFileSync(join(dir, file), "utf8")) as AbstractIntlMessages;
  }
  cache.set(locale, messages);
  return messages;
}
