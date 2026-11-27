import path from "node:path";

/** Binario `claude` falso (el mismo de las pruebas de la API): extracción y correo sin red. */
export const FAKE_CLAUDE_BIN = path.resolve(
  import.meta.dirname,
  "../../apps/api/test/fake-claude.mjs",
);

/** Vacante que "extrae" Claude en el E2E; el texto pegado en la prueba no importa. */
export const FAKE_VACANCY = {
  title: "Ingeniera Backend E2E",
  company: "ACME S.A.",
  location: "Remoto",
  seniority: "Senior",
  language: "es",
  summary: "Construir y operar APIs sobre Postgres.",
  mustHave: ["TypeScript", "PostgreSQL"],
  niceToHave: ["Docker"],
  responsibilities: ["Diseñar servicios", "Revisar código"],
  keywords: ["typescript", "postgres"],
  posterName: "Laura Gómez",
  posterTitle: "Technical Recruiter",
  postedAtText: "hace 3 días",
};

/** Correo de postulación que "redacta" Claude (#19): sin saludo, lo agrega la API. */
export const FAKE_EMAIL = {
  subject: "Postulación: Ingeniera Backend E2E",
  body: "Me interesa el rol de Ingeniera Backend en ACME.\n\nSaludos,\nAna Pérez",
  language: "es",
};

/** Env para la API del E2E: `claude` falso que responde según la propiedad del esquema pedido. */
export const FAKE_CLAUDE_ENV = {
  CLAUDE_BIN: FAKE_CLAUDE_BIN,
  FAKE_CLAUDE_OUTPUTS: JSON.stringify({ subject: FAKE_EMAIL, title: FAKE_VACANCY }),
};
