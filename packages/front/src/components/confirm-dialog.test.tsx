// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";

afterEach(cleanup);

function renderDialog(onConfirm = vi.fn()) {
  render(
    <ConfirmDialog
      trigger={<Button>Eliminar</Button>}
      title="¿Eliminar el CV?"
      description="Se pierde su contenido."
      confirmLabel="Eliminar CV"
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("ConfirmDialog", () => {
  it("el disparador abre un alertdialog con el título y lo que se pierde", async () => {
    renderDialog();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("¿Eliminar el CV?");
    expect(dialog.textContent).toContain("Se pierde su contenido.");
  });

  it("Cancelar cierra sin ejecutar la acción", async () => {
    const onConfirm = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("el botón que repite el verbo ejecuta la acción y cierra", async () => {
    const onConfirm = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar CV" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
