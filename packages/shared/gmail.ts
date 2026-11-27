/** Estado de la conexión con Gmail que ve la web (#11). */
export type GmailConnectionState =
  | "not_configured"
  | "disconnected"
  | "connected"
  | "reauth_required";

export interface GmailStatus {
  state: GmailConnectionState;
  /** Cuenta conectada según `users.getProfile`; `null` si no hay una conectada. */
  email: string | null;
}

/** Inicio del consentimiento: la web abre `authUrl` y espera a que la api reciba el callback. */
export interface GmailConnectStart {
  authUrl: string;
}

/** Estado de la detección automática de respuestas (#22). */
export interface GmailSyncStatus {
  /** Última sincronización terminada; `null` si nunca corrió. */
  lastSyncedAt: string | null;
  /** Cada cuántos minutos se sincroniza mientras la app corre. */
  intervalMinutes: number;
}

/** Resultado de una sincronización: sin cuenta usable no se llama a Gmail (REQ-006). */
export type GmailSyncResult =
  | { state: "synced"; recorded: number; lastSyncedAt: string }
  | { state: "skipped"; reason: Exclude<GmailConnectionState, "connected"> };
