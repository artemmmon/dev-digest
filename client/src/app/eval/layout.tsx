import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Tab title for /eval and /eval/:agentId (the pages are client components, so the title lives here;
    the text is in the eval message namespace, NFR-5). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("eval");
  return { title: t("meta.title") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
