// The published @types/pdf-parse only declares the top-level module.
// We import the inner module to skip pdf-parse's require.main debug branch.
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<{
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    text: string;
    version: string;
  }>;
  export default pdfParse;
}
