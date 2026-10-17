"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { NAV_LABEL_KEYS } from "../constants";

/**
 * Resolves a nav item's label from the eval message namespace for the keys that own
 * their text there (NFR-5); returns undefined for the others so the caller falls back
 * to the shell namespace / the item's literal label.
 */
export function useNavLabel(): (key: string) => string | undefined {
  const t = useTranslations("eval");
  return React.useCallback(
    (key: string) => (key in NAV_LABEL_KEYS ? t(NAV_LABEL_KEYS[key]!) : undefined),
    [t],
  );
}
