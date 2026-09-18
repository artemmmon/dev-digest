import type { AbstractIntlMessages } from "next-intl";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read every `messages/<locale>/<ns>.json` into `{ [ns]: {...} }`. Plain Node, no
 * next-intl server API, so component tests can load the real catalogue too.
 */
export function loadMessages(locale: string): AbstractIntlMessages {
  const dir = join(process.cwd(), "messages", locale);
  const messages: Record<string, AbstractIntlMessages> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const ns = file.replace(/\.json$/, "");
    messages[ns] = JSON.parse(readFileSync(join(dir, file), "utf8")) as AbstractIntlMessages;
  }
  return messages;
}
