/* 404 for any URL that matches no route (and for notFound() calls). */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export default function NotFound() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <EmptyState
      icon="Search"
      title={t("notFound.title")}
      body={t("notFound.body")}
      cta={t("notFound.cta")}
      onCta={() => router.push("/")}
    />
  );
}
