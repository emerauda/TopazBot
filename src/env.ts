// Minimal .env loader shared by all entry points (no dotenv dependency).
// Existing environment variables are never overridden.
import { readFileSync } from 'fs';

export function loadEnvFile(path = '.env'): void {
  // Skip in the test environment for predictable tests
  if (process.env.JEST_WORKER_ID) return;
  try {
    const env = readFileSync(path, 'utf-8');
    env.split('\n').forEach((line) => {
      // Skip empty lines and comments
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;

      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        if (!process.env[key]) {
          process.env[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    });
  } catch {
    // A missing .env is fine — variables may come from the real environment
  }
}
