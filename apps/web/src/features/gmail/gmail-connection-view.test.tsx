// @vitest-environment happy-dom
import type { GmailStatus } from "@apply/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailConnectionView } from "./gmail-connection-view";

afterEach(cleanup);

const view = (status: GmailStatus, extra: { waitingUrl?: string; timedOut?: boolean } = {}) => {
  const onConnect = vi.fn();
  render(
    <GmailConnectionView
      status={status}
      waitingUrl={extra.waitingUrl ?? null}
      timedOut={extra.timedOut ?? false}
      onConnect={onConnect}
    />,
  );
  return onConnect;
};

const state = () => document.querySelector('[data-id="gmail-connection-view__state"]')?.textContent;

describe("GmailConnectionView", () => {
  it("sin configuración lo dice, explica cómo configurarlo y no ofrece conectar", () => {
    view({ state: "not_configured", email: null });
    expect(state()).toBe("No configurado");
    expect(screen.getByText(/GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("desconectado ofrece conectar y el botón llama a onConnect", () => {
    const onConnect = view({ state: "disconnected", email: null });
    expect(state()).toBe("Desconectado");
    fireEvent.click(screen.getByRole("button", { name: "Conectar Gmail" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it("conectado muestra la cuenta de getProfile y no ofrece conectar", () => {
    view({ state: "connected", email: "postulante@example.com" });
    expect(state()).toBe("Conectado");
    expect(screen.getByText("Cuenta conectada: postulante@example.com")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reauth required lo muestra con la cuenta y ofrece volver a conectar", () => {
    view({ state: "reauth_required", email: "postulante@example.com" });
    expect(state()).toBe("Requiere reconexión");
    expect(
      screen.getByText(/rechazó la autorización guardada de postulante@example.com/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Volver a conectar" })).toBeTruthy();
  });

  it("reauth sin cuenta conocida no inventa una dirección", () => {
    view({ state: "reauth_required", email: null });
    expect(screen.getByText(/rechazó la autorización guardada\. Tus/)).toBeTruthy();
  });

  it("mientras espera a Google lo anuncia, enlaza la URL y oculta el botón", () => {
    view({ state: "disconnected", email: null }, { waitingUrl: "https://accounts.example/auth" });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Esperando la autorización en Google");
    expect(screen.getByRole("link", { name: "Abrir Google otra vez" }).getAttribute("href")).toBe(
      "https://accounts.example/auth",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("si venció la espera lo avisa y deja reintentar", () => {
    view({ state: "disconnected", email: null }, { timedOut: true });
    expect(screen.getByRole("alert").textContent).toContain("No llegó la autorización");
    expect(screen.getByRole("button", { name: "Conectar Gmail" })).toBeTruthy();
  });
});
