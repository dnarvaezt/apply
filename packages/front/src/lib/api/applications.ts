import type { ApplicationTimeline, Channel } from "@apply/shared";
import { request } from "./http.ts";

export const applicationsApi = {
  timeline: (id: string) => request<ApplicationTimeline>(`/applications/${id}`),
  channels: () => request<Channel[]>("/channels"),
};
