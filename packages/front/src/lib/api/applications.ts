import type {
  AddEventRequest,
  AddEventResult,
  Application,
  ApplicationTimeline,
  Channel,
  CreateApplicationRequest,
} from "@apply/shared";
import { json, request } from "./http.ts";

export const applicationsApi = {
  list: (vacancyId?: string) =>
    request<Application[]>(
      vacancyId ? `/applications?vacancyId=${encodeURIComponent(vacancyId)}` : "/applications",
    ),
  timeline: (id: string) => request<ApplicationTimeline>(`/applications/${id}`),
  create: (req: CreateApplicationRequest) =>
    request<Application>("/applications", { method: "POST", body: json(req) }),
  addEvent: (id: string, req: AddEventRequest) =>
    request<AddEventResult>(`/applications/${id}/events`, { method: "POST", body: json(req) }),
  channels: () => request<Channel[]>("/channels"),
};
