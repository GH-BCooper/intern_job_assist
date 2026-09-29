import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build for real-browser end-to-end runs (`npm run e2e`).
 *
 * Identical to the production build except that the Supabase client is replaced
 * with the in-memory fake, so the signed-in screens can be driven with no
 * account, no network access and no credentials. Nothing in `src/` changes.
 */
function fakeSupabase(): Plugin {
  const CLIENT = 'export const supabase = createClient(supabaseUrl, supabaseAnonKey);';
  return {
    name: 'e2e-fake-supabase',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/lib/supabase.ts')) return null;
      if (!code.includes(CLIENT)) throw new Error('e2e: could not find the Supabase client to swap out');
      return code.replace(
        CLIENT,
        `import { createE2EClient } from '../../e2e/harness';\nexport const supabase = createE2EClient() as unknown as ReturnType<typeof createClient>;\nvoid supabaseUrl; void supabaseAnonKey;`,
      );
    },
  };
}

export default defineConfig({
  plugins: [fakeSupabase(), react()],
  optimizeDeps: { exclude: ['lucide-react'] },
  build: {
    outDir: 'dist-e2e',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://e2e.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('e2e'),
  },
});
