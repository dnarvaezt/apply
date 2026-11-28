import { Hono } from "hono";
import type { MetricsRepository } from "./repository.ts";

export interface MetricRoutesDeps {
  repo: MetricsRepository;
}

export function metricRoutes({ repo }: MetricRoutesDeps) {
  return new Hono().get("/metrics", async (c) => c.json(await repo.tracking()));
}
