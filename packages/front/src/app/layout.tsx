import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "@/index.css";

export const metadata: Metadata = {
  title: "Apply",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Extensiones como LanguageTool marcan <html> (data-lt-installed) antes de hidratar. Solo cubre
    // los atributos de este elemento: un desajuste dentro de la app se sigue reportando.
    <html lang="es" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
