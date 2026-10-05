"use client";

import { useTranslations } from "next-intl";
import type { Tour } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { s } from "../../styles";

/** One line below the last card: what the tour's generation used and cost (`—` when the cost is unknown). */
export function TourFooter({ tour }: { tour: Tour }) {
  const t = useTranslations("onboarding");
  return (
    <p style={s.footer}>
      {t("footer.line", {
        model: tour.model,
        tokensIn: tour.tokens_in,
        tokensOut: tour.tokens_out,
        cost: formatCost(tour.cost_usd),
      })}
    </p>
  );
}
