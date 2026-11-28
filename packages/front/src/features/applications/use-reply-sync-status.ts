import type { GmailSyncStatus } from "@apply/shared";
import { useEffect, useState } from "react";
import { isGmailEnabled } from "@/features/gmail/gmail-enabled";
import { api } from "@/lib/api";

/** Estado de la detección de respuestas; `null` mientras carga o si la api no lo pudo dar. */
export function useReplySyncStatus(): GmailSyncStatus | null {
  const [status, setStatus] = useState<GmailSyncStatus | null>(null);
  useEffect(() => {
    if (!isGmailEnabled()) return;
    let active = true;
    api.gmail
      .syncStatus()
      .then((s) => active && setStatus(s))
      .catch(() => active && setStatus(null));
    return () => {
      active = false;
    };
  }, []);
  return status;
}
