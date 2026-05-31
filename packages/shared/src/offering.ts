/** Structured offering fields used to build the compiled context block. */
export interface OfferingContextFields {
  name: string;
  description?: string | null;
  targetAudience?: string | null;
  problemSolved?: string | null;
  uniqueValueProp?: string | null;
  proofPoints?: string | null;
}

/**
 * Build the cached `compiledContext` block from structured offering fields.
 * Rebuilt on every save (api) and after a scrape merges a source (worker), so it
 * lives here to stay identical on both sides. Empty fields are omitted.
 *
 * Sources are merged into these structured fields at scrape time by the worker's
 * combine step (LLM reconciliation), so the compiled block stays clean and
 * categorized regardless of how many URLs contributed.
 */
export function compileOfferingContext(fields: OfferingContextFields): string {
  const sections: Array<[string, string | null | undefined]> = [
    ["", fields.name ? `# ${fields.name}` : null],
    ["What we do", fields.description],
    ["Who we sell to", fields.targetAudience],
    ["Problem we solve", fields.problemSolved],
    ["What makes us different", fields.uniqueValueProp],
    ["Proof points", fields.proofPoints],
  ];

  return sections
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([heading, body]) => (heading ? `## ${heading}\n${body}` : body))
    .join("\n\n");
}
