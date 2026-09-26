// Full game bootstrap (filled in as systems come online). For now it forwards to the sandbox.
export async function boot() {
  const m = await import('./tests/sandbox.js');
  m.default();
}
