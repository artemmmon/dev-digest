"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { NAV_LABEL_KEYS } from "../constants";

/**
 * Resolves a nav item's label from the message catalogue for the keys that have no literal
 * label in the vendored nav (NFR-5/NFR-6); returns undefined for the others so the caller falls
 * back to the shell namespace / the item's literal label. Paths are full (`eval.nav.label`).
 */
export function useNavLabel(): (key: string) => string | undefined {
  const t = useTranslations();
  return React.useCallback(
    (key: string) => (key in NAV_LABEL_KEYS ? t(NAV_LABEL_KEYS[key]!) : undefined),
    [t],
  );
}
