const MAX_TEXT = 150_000;

/** Descarga una página de vacante y extrae su texto (prioriza JSON-LD JobPosting). */
export async function fetchVacancyText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("URL no soportada");

  const res = await fetch(parsed, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)",
      "Accept-Language": "es,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`La página respondió ${res.status}. Pega el texto manualmente.`);
  const html = await res.text();

  const jobPosting = extractJobPosting(html);
  const text = jobPosting ?? htmlToText(html);
  if (text.length < 200) {
    throw new Error(
      "No se encontró texto suficiente (¿requiere login?). Pega el texto manualmente.",
    );
  }
  if (text.length > MAX_TEXT) {
    throw new Error("La página es demasiado grande. Copia y pega solo el texto de la vacante.");
  }
  return text;
}

function extractJobPosting(html: string): string | null {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, json] of scripts) {
    try {
      const data = JSON.parse(json);
      const items = (Array.isArray(data) ? data : [data, ...(data["@graph"] ?? [])]) as Record<
        string,
        unknown
      >[];
      const job = items.find((i) => i?.["@type"] === "JobPosting");
      if (job) {
        const org = job.hiringOrganization as { name?: string } | undefined;
        return [
          `Puesto: ${job.title ?? ""}`,
          org?.name ? `Empresa: ${org.name}` : "",
          job.employmentType ? `Tipo: ${job.employmentType}` : "",
          htmlToText(String(job.description ?? "")),
        ]
          .filter(Boolean)
          .join("\n");
      }
    } catch {
      // JSON-LD inválido: seguimos con el siguiente
    }
  }
  return null;
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head|nav|footer)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|h[1-6]|li|ul|ol|section|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n")
    .trim();
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}
