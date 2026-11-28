// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileFileList, type ProfileFileListProps } from "./profile-file-list";

afterEach(cleanup);

const setup = (props: Partial<ProfileFileListProps> = {}) => {
  const handlers = {
    onOpen: vi.fn(),
    onModeChange: vi.fn(),
    onMove: vi.fn(),
    onRename: vi.fn(async () => true),
  };
  render(
    <ProfileFileList
      names={["00-contacto.md", "10-exp.md", "20-proy.md"]}
      selected="10-exp.md"
      mode="custom"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("ProfileFileList", () => {
  it("abre el archivo al pulsarlo y marca el seleccionado", () => {
    const { onOpen } = setup();
    expect(button("10-exp.md").getAttribute("aria-current")).toBe("true");
    fireEvent.click(button("20-proy.md"));
    expect(onOpen).toHaveBeenCalledWith("20-proy.md");
  });

  it("en modo personalizado sube y baja, sin pasar de los bordes", () => {
    const { onMove } = setup();
    expect(button("Subir 00-contacto.md").disabled).toBe(true);
    expect(button("Bajar 20-proy.md").disabled).toBe(true);
    fireEvent.click(button("Subir 10-exp.md"));
    fireEvent.click(button("Bajar 10-exp.md"));
    expect(onMove.mock.calls).toEqual([
      ["10-exp.md", -1],
      ["10-exp.md", 1],
    ]);
  });

  it("en modo A–Z no ofrece subir ni bajar", () => {
    setup({ mode: "alpha" });
    expect(screen.queryByRole("button", { name: /^Subir/ })).toBeNull();
    expect(button("A–Z").getAttribute("aria-pressed")).toBe("true");
  });

  it("cambia de modo solo al pulsar el otro", () => {
    const { onModeChange } = setup();
    fireEvent.click(button("Personalizado"));
    fireEvent.click(button("A–Z"));
    expect(onModeChange.mock.calls).toEqual([["alpha"]]);
  });

  it("renombra editando el nombre sin la extensión .md", async () => {
    const { onRename } = setup();
    fireEvent.click(button("Renombrar 10-exp.md"));
    const input = screen.getByLabelText("Nuevo nombre de 10-exp.md") as HTMLInputElement;
    expect(input.value).toBe("10-exp");
    expect(screen.getByText(".md")).toBeTruthy();
    fireEvent.change(input, { target: { value: " 15-experiencia " } });
    fireEvent.click(button("Guardar nombre"));
    await waitFor(() => expect(screen.queryByLabelText(/Nuevo nombre/)).toBeNull());
    expect(onRename).toHaveBeenCalledWith("10-exp.md", "15-experiencia");
  });

  it("si el renombre falla sigue editando con lo escrito", async () => {
    const onRename = vi.fn(async () => false);
    setup({ onRename });
    fireEvent.click(button("Renombrar 10-exp.md"));
    fireEvent.change(screen.getByLabelText("Nuevo nombre de 10-exp.md"), {
      target: { value: "20-proy" },
    });
    fireEvent.click(button("Guardar nombre"));
    await waitFor(() => expect(onRename).toHaveBeenCalled());
    expect((screen.getByLabelText("Nuevo nombre de 10-exp.md") as HTMLInputElement).value).toBe(
      "20-proy",
    );
  });

  it("Escape cancela sin renombrar y un nombre vacío no se envía", () => {
    const { onRename } = setup();
    fireEvent.click(button("Renombrar 10-exp.md"));
    const input = screen.getByLabelText("Nuevo nombre de 10-exp.md");
    fireEvent.change(input, { target: { value: "  " } });
    expect(button("Guardar nombre").disabled).toBe(true);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText(/Nuevo nombre/)).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });
});
