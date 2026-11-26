import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVacancyText, htmlToText } from "./fetch-url.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: string, status = 200) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const LONG = "Buscamos una persona con experiencia en TypeScript y Node. ".repeat(6);

describe("htmlToText", () => {
  it("elimina scripts, estilos, navegación y pies", () => {
    const html =
      "<head><title>x</title></head><nav>menu</nav><script>var a=1</script><style>p{}</style><p>Hola</p><footer>pie</footer>";
    expect(htmlToText(html)).toBe("Hola");
  });

  it("convierte listas y saltos de línea en texto plano", () => {
    expect(htmlToText("<ul><li>uno</li><li>dos</li></ul>")).toBe("- uno\n\n- dos");
    expect(htmlToText("a<br>b<br/>c")).toBe("a\nb\nc");
  });

  it("decodifica entidades nombradas, decimales y hexadecimales", () => {
    expect(htmlToText("&amp; &lt;b&gt; &quot;q&quot; &apos;a&apos; x&nbsp;y &#65; &#x42;")).toBe(
      `& <b> "q" 'a' x y A B`,
    );
  });

  it("deja intactas las entidades desconocidas", () => {
    expect(htmlToText("&desconocida;")).toBe("&desconocida;");
  });

  it("colapsa espacios y líneas en blanco repetidas", () => {
    expect(htmlToText("<p>a   \t b</p><p></p><p></p><p>c</p>")).toBe("a b\n\nc");
  });
});

describe("fetchVacancyText", () => {
  it.each([
    "https://www.linkedin.com/jobs/view/1",
    "https://linkedin.com/jobs/view/1",
    "https://es.linkedin.com/jobs/view/1",
    "https://lnkd.linkedin.com/x",
    "https://LinkedIn.com/jobs/view/1",
    "https://WWW.LINKEDIN.COM/jobs/view/1",
  ])("rechaza %s pidiendo pegar el texto, sin llamar a la red", async (url) => {
    const fetchMock = stubFetch(`<p>${LONG}</p>`);
    await expect(fetchVacancyText(url)).rejects.toThrow(
      "LinkedIn no permite la descarga automática. Pega el texto de la vacante.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://notlinkedin.com/x",
    "https://linkedin.com.evil.com/x",
    "https://example.com/linkedin.com",
    "https://user:pw@example.com/?u=www.linkedin.com",
  ])("no rechaza por host %s", async (url) => {
    const fetchMock = stubFetch(`<p>${LONG}</p>`);
    expect(await fetchVacancyText(url)).toBe(LONG.trim());
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rechaza protocolos que no son http(s) sin llamar a la red", async () => {
    const fetchMock = stubFetch("x");
    await expect(fetchVacancyText("file:///etc/passwd")).rejects.toThrow("URL no soportada");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falla con la respuesta HTTP no exitosa", async () => {
    stubFetch("no", 404);
    await expect(fetchVacancyText("https://example.com/job")).rejects.toThrow(
      "La página respondió 404",
    );
  });

  it("extrae el texto plano de la página", async () => {
    stubFetch(`<html><body><p>${LONG}</p></body></html>`);
    expect(await fetchVacancyText("https://example.com/job")).toBe(LONG.trim());
  });

  it("prioriza el JSON-LD JobPosting", async () => {
    const ld = JSON.stringify({
      "@type": "JobPosting",
      title: "Dev Senior",
      hiringOrganization: { name: "Acme" },
      employmentType: "FULL_TIME",
      description: `<p>${LONG}</p>`,
    });
    stubFetch(
      `<script type="application/ld+json">${ld}</script><body><p>texto alterno ${LONG}</p></body>`,
    );
    const text = await fetchVacancyText("https://example.com/job");
    expect(text).toBe(`Puesto: Dev Senior\nEmpresa: Acme\nTipo: FULL_TIME\n${LONG.trim()}`);
  });

  it("encuentra el JobPosting dentro de un arreglo o de @graph y omite campos vacíos", async () => {
    const inArray = JSON.stringify([
      { "@type": "Org" },
      { "@type": "JobPosting", description: LONG },
    ]);
    stubFetch(`<script type='application/ld+json'>${inArray}</script>`);
    expect(await fetchVacancyText("https://example.com/a")).toBe(`Puesto: \n${LONG.trim()}`);

    const inGraph = JSON.stringify({
      "@graph": [{ "@type": "JobPosting", title: "T", description: LONG }],
    });
    stubFetch(`<script type="application/ld+json">${inGraph}</script>`);
    expect(await fetchVacancyText("https://example.com/b")).toBe(`Puesto: T\n${LONG.trim()}`);
  });

  it("ignora JSON-LD inválido o sin JobPosting y usa el HTML", async () => {
    stubFetch(
      `<script type="application/ld+json">{roto</script><script type="application/ld+json">{"@type":"Org"}</script><p>${LONG}</p>`,
    );
    expect(await fetchVacancyText("https://example.com/c")).toBe(LONG.trim());
  });

  it("falla si hay poco texto", async () => {
    stubFetch("<p>corto</p>");
    await expect(fetchVacancyText("https://example.com/d")).rejects.toThrow(
      "No se encontró texto suficiente",
    );
  });

  it("acepta texto de exactamente 200 caracteres", async () => {
    stubFetch(`<p>${"a".repeat(200)}</p>`);
    expect(await fetchVacancyText("https://example.com/e")).toHaveLength(200);
  });

  it("falla si la página es demasiado grande y acepta el límite exacto", async () => {
    stubFetch(`<p>${"a".repeat(150_001)}</p>`);
    await expect(fetchVacancyText("https://example.com/f")).rejects.toThrow("demasiado grande");
    stubFetch(`<p>${"a".repeat(150_000)}</p>`);
    expect(await fetchVacancyText("https://example.com/g")).toHaveLength(150_000);
  });
});
