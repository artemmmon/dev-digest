import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Tab title for /skills and its sub-routes (the pages are client components, so the title lives here). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("skills") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
