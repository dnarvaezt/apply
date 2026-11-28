/**
 * Gmail está fuera de la interfaz por ahora: sin la ruta /gmail, sin «Enviar con Gmail» y sin el
 * aviso de respuestas. El backend sigue igual. `NEXT_PUBLIC_GMAIL=1` lo vuelve a mostrar (lo usa el
 * e2e). Next fija el valor al arrancar `next dev` o al compilar.
 */
export function isGmailEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GMAIL === "1";
}
