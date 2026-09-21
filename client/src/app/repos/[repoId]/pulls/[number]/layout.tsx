import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Tab title for a PR page. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("pull") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
