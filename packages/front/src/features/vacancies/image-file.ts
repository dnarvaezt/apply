export type VacancyImageInput = { mediaType: string; data: string };

const CHUNK = 0x8000;

/** Lee el archivo como base64 (sin prefijo `data:`); el API valida el tipo y el tamaño. */
export async function readImageFile(file: File): Promise<VacancyImageInput> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return { mediaType: file.type, data: btoa(binary) };
}
