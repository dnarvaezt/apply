import type { NextConfig } from "next";

// La API corre aparte (packages/back). API_PORT y no PORT: `next dev` usa PORT para sí mismo.
const apiOrigin = `http://localhost:${process.env.API_PORT ?? 3001}`;

const config: NextConfig = {
  // @apply/shared se publica como TypeScript sin compilar.
  transpilePackages: ["@apply/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
