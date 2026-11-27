import type { AddressInfo } from "node:net";

/** Puerto de un servidor que ya escucha en TCP. */
export function boundPort(address: string | AddressInfo | null): number {
  if (address === null || typeof address === "string") {
    throw new Error("El servidor no escucha en un puerto TCP");
  }
  return address.port;
}
