import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Tab title for /onboarding (the add-repository screen). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("addRepo") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
