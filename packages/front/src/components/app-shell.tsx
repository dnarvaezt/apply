"use client";

import { BarChart3, Briefcase, FileText, Mail, Send, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/profile", label: "Mi perfil", icon: UserRound },
  { href: "/vacancies", label: "Vacantes", icon: Briefcase },
  { href: "/cvs", label: "CVs", icon: FileText },
  { href: "/applications", label: "Postulaciones", icon: Send },
  { href: "/metrics", label: "Métricas", icon: BarChart3 },
  { href: "/gmail", label: "Gmail", icon: Mail },
] as const;

/** Cabecera con la navegación entre secciones; cada sección es una ruta. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3">
          <h1 className="font-semibold tracking-tight">Apply</h1>
          <nav aria-label="Secciones" className="flex min-w-0 max-w-full gap-1 overflow-x-auto">
            {SECTIONS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
                  )}
                >
                  <Icon /> {label}
                </Link>
              );
            })}
          </nav>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
            Todo se guarda en local en <code>./data</code>
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] p-4">{children}</main>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
