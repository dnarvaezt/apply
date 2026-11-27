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
