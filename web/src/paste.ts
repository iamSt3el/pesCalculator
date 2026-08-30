export interface PasteOutcome {
  /** Months written to the chart. */
  written: number;
  /** Lines the parser could not read a month from. */
  errors: string[];
  /** Why the request itself failed, or null when it reached the server. */
  failure: string | null;
}

/**
 * Runs a paste and reports every way it can end. The box used to call the API
 * inside a bare try/finally, so a rejected request — a duplicated month used to
 * make the server throw — left the button un-busied and nothing on screen at
 * all. A failure is an outcome, not an absence of one.
 */
export async function submitPaste(
  text: string,
  paste: (text: string) => Promise<{ written: number; errors: string[] }>,
): Promise<PasteOutcome> {
  try {
    const { written, errors } = await paste(text);
    return { written, errors, failure: null };
  } catch (e) {
    return { written: 0, errors: [], failure: (e as Error).message };
  }
}
