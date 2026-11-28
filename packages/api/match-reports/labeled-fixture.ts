import type { MatchLevel } from "@apply/shared";

/**
 * Par etiquetado a mano para la regresión del match (C9): el nivel esperado es el juicio de una
 * persona que lee el CV, no la salida del modelo. Solo entran requisitos donde ese juicio no es
 * dudoso; los casos en que `multilingual-e5-small` y los umbrales actuales se equivocan (p. ej.
 * "Desarrollo frontend con React" sale fuerte) son evidencia para recalibrar en #25, no fixture.
 */
export const LABELED_CV = `# Ana Pérez

**Ingeniera Backend Senior** · ana@example.com · Bogotá

## Resumen

Ingeniera backend con 7 años construyendo APIs REST en TypeScript y Node.js sobre PostgreSQL.

## Experiencia

### ACME Pagos (2020–2025)

- Diseñé y operé APIs REST en TypeScript y Node.js para pagos en línea con PostgreSQL.
- Lideré la migración de consultas SQL lentas y bajé la latencia p95 un 40 %.
- Monté pipelines de CI con pruebas automatizadas y revisiones de código.

### Globex Datos (2017–2020)

- Construí pipelines de datos con Python y Airflow.

## Idiomas

Español nativo, inglés avanzado (C1).
`;

export const LABELED_EXPECTED: { requirement: string; kind: "must" | "nice"; level: MatchLevel }[] =
  [
    { requirement: "Experiencia con TypeScript y Node.js", kind: "must", level: "fuerte" },
    { requirement: "Experiencia en pagos en línea", kind: "must", level: "fuerte" },
    // El CV muestra APIs REST, no una arquitectura de microservicios: evidencia indirecta.
    { requirement: "Arquitectura de microservicios", kind: "must", level: "parcial" },
    { requirement: "Contabilidad y facturación electrónica", kind: "must", level: "débil" },
    { requirement: "Inglés avanzado", kind: "nice", level: "fuerte" },
    { requirement: "Pipelines de datos con Python y Airflow", kind: "nice", level: "fuerte" },
    // "Pipelines de CI" sin nombrar la herramienta.
    { requirement: "Integración continua con GitHub Actions", kind: "nice", level: "parcial" },
    { requirement: "Fotografía de producto", kind: "nice", level: "débil" },
  ];

export const LABELED_VACANCY = {
  mustHave: LABELED_EXPECTED.filter((r) => r.kind === "must").map((r) => r.requirement),
  niceToHave: LABELED_EXPECTED.filter((r) => r.kind === "nice").map((r) => r.requirement),
  keywords: ["TypeScript", "Node.js", "PostgreSQL", "Kubernetes", "Java"],
};
