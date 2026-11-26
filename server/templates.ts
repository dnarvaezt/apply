/**
 * Plantillas iniciales de la base de conocimiento.
 * Los archivos que empiezan con "00-" se incluyen SIEMPRE en el contexto del CV
 * (datos de contacto, resumen base). El resto se recupera por similitud con la vacante.
 */
export const PROFILE_TEMPLATES: Record<string, string> = {
  "00-contacto.md": `# Contacto

- Nombre: Tu Nombre Completo
- Título profesional: Ingeniero de Software
- Email: tu@email.com
- Teléfono: +00 000 000 0000
- Ubicación: Ciudad, País
- LinkedIn: https://linkedin.com/in/tu-usuario
- GitHub: https://github.com/tu-usuario
- Portafolio: https://tu-sitio.dev

# Resumen base

Escribe aquí 3-5 líneas sobre quién eres profesionalmente, años de experiencia,
especialidad y qué tipo de problemas te gusta resolver.
`,
  "10-experiencia.md": `# Experiencia

Escribe cada puesto como una sección "##". Sé exhaustivo: el RAG elegirá lo relevante
para cada vacante. Incluye métricas (%, tiempos, usuarios, dinero) siempre que puedas.

## Empresa Ejemplo — Senior Frontend Engineer (2022 – Presente)

- Stack: TypeScript, React, Next.js, Node.js, PostgreSQL, AWS
- Lideré la migración de una app monolítica a microfrontends, reduciendo el tiempo de build un 60%.
- Diseñé un design system con 40+ componentes usado por 5 equipos.
- Mentoría a 3 desarrolladores junior.

## Otra Empresa — Full Stack Developer (2019 – 2022)

- Stack: JavaScript, Vue, Express, MongoDB
- Construí la API de pagos que procesa 10k transacciones/día.
`,
  "20-proyectos.md": `# Proyectos

## Nombre del proyecto

- Descripción: qué es y qué problema resuelve.
- Stack: tecnologías usadas.
- Logros: usuarios, estrellas, impacto.
- Link: https://...
`,
  "30-habilidades.md": `# Habilidades

## Lenguajes
TypeScript, JavaScript, Python, SQL

## Frontend
React, Next.js, Tailwind CSS, shadcn/ui, testing con Vitest y Playwright

## Backend
Node.js, Hono, Express, PostgreSQL, Redis, REST, GraphQL

## Cloud / DevOps
AWS (Lambda, S3, ECS), Docker, GitHub Actions, Terraform

## Blandas
Liderazgo técnico, comunicación con stakeholders, mentoría

## Idiomas
Español (nativo), Inglés (B2/C1)
`,
  "40-educacion.md": `# Educación

## Universidad Ejemplo — Ingeniería de Sistemas (2014 – 2019)

# Certificaciones

## AWS Certified Developer – Associate (2023)
`,
  "50-logros-y-otros.md": `# Logros y otros

Usa este archivo para todo lo que no encaje en otro lado: charlas, publicaciones,
voluntariado, premios, contribuciones open source, anécdotas con métricas, etc.
`,
};
