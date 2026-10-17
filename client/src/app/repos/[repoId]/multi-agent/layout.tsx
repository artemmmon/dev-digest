import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Tab title for the Multi-Agent Review page (the page is a client component, so the title lives here). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("multiAgent") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
