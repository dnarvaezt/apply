import type { GmailConnectStart, GmailStatus, GmailSyncStatus } from "@apply/shared";
import { request } from "./http.ts";

export const gmailApi = {
  status: () => request<GmailStatus>("/gmail/status"),
  connect: () => request<GmailConnectStart>("/gmail/connect", { method: "POST" }),
  syncStatus: () => request<GmailSyncStatus>("/gmail/sync"),
};
