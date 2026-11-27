import { describe, expect, it } from "vitest";
import { boundPort } from "./loopback.ts";

describe("boundPort", () => {
  it("devuelve el puerto de un servidor TCP escuchando", () => {
    expect(boundPort({ address: "127.0.0.1", family: "IPv4", port: 53_123 })).toBe(53_123);
  });

  it.each([null, "/tmp/apply.sock"])("falla si el servidor no escucha en TCP (%j)", (address) => {
    expect(() => boundPort(address)).toThrow("El servidor no escucha en un puerto TCP");
  });
});
