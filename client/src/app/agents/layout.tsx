import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Tab title for /agents and /agents/:id (the pages are client components, so the title lives here). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("agents") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
