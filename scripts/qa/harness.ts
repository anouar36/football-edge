/** Minimal runner for the QA scripts: prints every check and sets exit code 1 if one failed. */

let passed = 0;
const failures: string[] = [];

export function section(title: string) {
  console.log(`\n## ${title}`);
}

export function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failures.push(name);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? `  (${detail})` : ""}`);
}

export const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

/** Prints the totals; call once at the end. */
export function done() {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length) process.exitCode = 1;
}
