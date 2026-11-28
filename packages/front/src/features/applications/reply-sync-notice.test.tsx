// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReplySyncNotice } from "./reply-sync-notice";

afterEach(cleanup);

const notice = () => document.querySelector('[data-id="reply-sync-notice"]');
const lastSync = () => document.querySelector('[data-id="reply-sync-notice__last-sync"]');

describe("ReplySyncNotice", () => {
  it("declara qué cubre la detección y que el resto se registra a mano (REQ-007)", () => {
    render(<ReplySyncNotice status={{ lastSyncedAt: null, intervalMinutes: 15 }} />);
    const text = notice()?.textContent ?? "";
    expect(text).toMatch(/hilo de los correos enviados con Apply/);
    expect(text).toMatch(/contactos con email conocido/);
    expect(text).toMatch(/últimos 90 días/);
    expect(text).toMatch(/al iniciar y cada 15 minutos/);
    expect(text).toMatch(/LinkedIn, ATS o teléfono se registra a mano/);
  });

  it("sin sincronizaciones lo dice", () => {
    render(<ReplySyncNotice status={{ lastSyncedAt: null, intervalMinutes: 15 }} />);
    expect(lastSync()?.textContent).toBe("Aún no se ha sincronizado.");
  });

  it("muestra la última sincronización con su fecha exacta", () => {
    render(
      <ReplySyncNotice
        status={{ lastSyncedAt: "2026-11-20T10:00:00.000Z", intervalMinutes: 30 }}
      />,
    );
    // Fecha y hora: con varias sincronizaciones al día la hora es lo que cambia.
    expect(lastSync()?.textContent).toMatch(/^Última sincronización: .*2026.*\d{1,2}:\d{2}/);
    expect(lastSync()?.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-11-20T10:00:00.000Z",
    );
    expect(notice()?.textContent).toMatch(/cada 30 minutos/);
  });

  it("sin estado conocido declara la cobertura sin intervalo ni última sincronización", () => {
    render(<ReplySyncNotice status={null} />);
    expect(notice()?.textContent).toMatch(/contactos con email conocido/);
    expect(notice()?.textContent).not.toMatch(/cada \d+ minutos/);
    expect(lastSync()).toBeNull();
  });
});
