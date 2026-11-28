import type { TrackingMetrics } from "@apply/shared";
import { request } from "./http.ts";

export const metricsApi = {
  tracking: () => request<TrackingMetrics>("/metrics"),
};
