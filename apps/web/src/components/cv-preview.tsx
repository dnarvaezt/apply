import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "@apply/shared/cv-theme.css";

/** Vista previa con el mismo CSS que se usa para el PDF, en proporción A4. */
export function CvPreview({ markdown }: { markdown: string }) {
  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white shadow-sm ring-1 ring-black/5">
      <article className="cv min-h-[297mm] px-[15mm] py-[14mm]">
        <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
      </article>
    </div>
  );
}
