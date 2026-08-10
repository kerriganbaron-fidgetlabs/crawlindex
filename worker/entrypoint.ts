import { pathToFileURL } from 'node:url';

/**
 * Was this module run directly, rather than imported?
 *
 * Every worker in this directory ends by calling `main()`. That is fine for a script and
 * dangerous for a module: the moment one worker imports a helper from another, or a test
 * imports one to check a pure function, the exporting worker's `main()` runs too. That is
 * not hypothetical. The intake worker imported one predicate from the seeder and thereby
 * started a live Tranco fetch and a second concurrent write to `corpus.json`.
 *
 * So every worker guards its `main()` with this.
 */
export function isEntrypoint(moduleUrl: string): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return moduleUrl === pathToFileURL(invoked).href;
  } catch {
    return false;
  }
}
