import mammoth from "mammoth";

// Lazy PDF parse to avoid heavy bundle on first paint
async function parsePdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  // Use bundled worker from pdfjs-dist via Vite worker import
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out.push(content.items.map((it: any) => it.str).join(" "));
  }
  return out.join("\n\n").trim();
}

async function parseDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return value.trim();
}

async function parseText(file: File): Promise<string> {
  return (await file.text()).trim();
}

export async function parseDocument(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return parsePdf(file);
  if (name.endsWith(".docx")) return parseDocx(file);
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown") || file.type.startsWith("text/")) {
    return parseText(file);
  }
  throw new Error(`Неподдерживаемый формат: ${file.name}. Поддерживаются PDF, DOCX, TXT, MD.`);
}

export const ACCEPTED = ".pdf,.docx,.txt,.md,.markdown,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
