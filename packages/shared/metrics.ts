/** Postulaciones cuyo primer evento de contacto llegó por un canal (`null`: sin canal). */
export interface ContactOrigin {
  channel: string | null;
  count: number;
}

/** Métricas de seguimiento, calculadas desde los eventos en cada consulta. */
export interface TrackingMetrics {
  applications: number;
  companiesContacted: number;
  activeProcesses: number;
  classified: number;
  contactOrigin: ContactOrigin[];
  open: number;
  closed: number;
}
