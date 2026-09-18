import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Tab title for /settings/*. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("settings") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
