import { getRequestConfig } from "next-intl/server";
import { loadMessages } from "./load-messages";

/**
 * i18n config (next-intl, single locale `en`, no locale routing).
 *
 * Messages are split per feature namespace under `messages/<locale>/<ns>.json`
 * and merged here into `{ [ns]: {...} }`. Feature agents add their own
 * `messages/en/<feature>.json` without touching shared code — no contention.
 * Use it via `useTranslations("<ns>")` (client) or `getTranslations("<ns>")`.
 */
export const LOCALE = "en";

export default getRequestConfig(async () => ({
  locale: LOCALE,
  messages: loadMessages(LOCALE),
}));
