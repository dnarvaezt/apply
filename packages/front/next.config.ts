import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// La API corre aparte (packages/back). API_PORT y no PORT: `next dev` usa PORT para sí mismo.
const apiOrigin = `http://localhost:${process.env.API_PORT ?? 3001}`;

// `next dev` imprime la URL de red (p. ej. http://192.168.1.26:5173), pero en desarrollo solo deja
// a localhost pedir sus recursos: abierta por esa IP, la página no hidrata y no carga datos.
const ownNetworkAddresses = Object.values(networkInterfaces())
  .flat()
  .flatMap((net) => (net && !net.internal ? [net.address] : []));

const config: NextConfig = {
  // @apply/shared se publica como TypeScript sin compilar.
  transpilePackages: ["@apply/shared"],
  allowedDevOrigins: ownNetworkAddresses,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
