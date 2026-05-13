import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { DocsProvider } from "@/contexts/DocsContext";
import { ModelProvider } from "@/contexts/ModelContext";

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <DocsProvider>{children}</DocsProvider>
  </ModelProvider>
);

export const renderWithProviders = (ui: ReactElement, opts?: Omit<RenderOptions, "wrapper">) =>
  render(ui, { wrapper: Providers, ...opts });

export * from "@testing-library/react";
