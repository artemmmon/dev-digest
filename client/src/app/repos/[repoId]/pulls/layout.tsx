import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Tab title for the PR list; a PR page below sets its own. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("pulls") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
