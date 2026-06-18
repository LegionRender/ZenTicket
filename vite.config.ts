import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'path';
import {defineConfig} from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'vendor-firebase';
            if (id.includes('/react-dom/')) return 'vendor-react-dom';
            if (id.includes('/react/')) return 'vendor-react';
            if (id.includes('/react-router/')) return 'vendor-router';
            if (id.includes('/@radix-ui/')) return 'vendor-radix';
            if (id.includes('/motion-dom/') || id.includes('/framer-motion/')) return 'vendor-motion';
            if (id.includes('/lucide-react/')) return 'vendor-icons';
            if (id.includes('/sonner/')) return 'vendor-sonner';
            if (id.includes('/@tanstack/')) return 'vendor-tanstack';
            return undefined;
          },
        },
      },
    },
  };
});
