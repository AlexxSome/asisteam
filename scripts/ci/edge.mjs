import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withEdge(run) {
  const dir = mkdtempSync(join(tmpdir(), 'asisteam-ci-edge-'));
  const secret = 'ci-synthetic-invitation-proxy-only';
  const envPath = join(dir, 'edge.env');
  writeFileSync(envPath, `INVITATION_PROXY_SECRET=${secret}\nINVITATION_ALLOWED_ORIGINS=http://127.0.0.1:3120\n`, { mode: 0o600 });
  const edge = spawn('pnpm', ['exec', 'supabase', 'functions', 'serve', 'accept-invitation', '--env-file', envPath], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false;
  edge.on('error', () => {});
  for (const stream of [edge.stdout, edge.stderr]) stream.on('data', chunk => { ready ||= /Serving functions/i.test(chunk.toString()); });
  try {
    const deadline = Date.now() + 60000;
    while (!ready && Date.now() < deadline && edge.exitCode === null) await new Promise(resolve => setTimeout(resolve, 250));
    if (!ready) throw new Error('Edge local no listo');
    await run(secret);
  } finally {
    // pnpm launches the CLI as a child: stop the owned process group as well.
    if (edge.pid) {
      try { process.kill(-edge.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
      const deadline = Date.now() + 5000;
      while (edge.exitCode === null && edge.signalCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      try { process.kill(-edge.pid, 'SIGKILL'); } catch { /* Already stopped. */ }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
