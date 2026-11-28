import type { ApplicationEventType } from "@apply/shared";

/** Qué hace que una postulación cuente como clasificada. */
export interface ClassifiedDefinition {
  /** Tipos de evento que la clasifican al llegar a ellos. */
  eventTypes: readonly ApplicationEventType[];
  /** Si un contacto marcado como inicio de proceso también la clasifica. */
  processStartContact: boolean;
}

/**
 * Única definición de "clasificada" (C8): llegó a entrevista u oferta, o tiene un contacto
 * marcado como inicio de proceso. La usan `classified_at` y las métricas.
 */
export const CLASSIFIED: ClassifiedDefinition = {
  eventTypes: ["interview", "offer"],
  processStartContact: true,
};
