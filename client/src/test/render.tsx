/* Test render helper: the providers a component expects at runtime, with the real
   message catalogue — so a test fails on a missing i18n key instead of stubbing it. */
import React from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/lib/toast";
import { loadMessages } from "@/i18n/load-messages";

const messages = loadMessages("en");

/** Render `ui` inside next-intl (all namespaces), a fresh QueryClient and the toast host. */
export function renderWithIntl(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Providers({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Providers, ...options });
}
