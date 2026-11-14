import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In produzione il sito vive in una sottocartella su Aruba.
// In dev: root standard + proxy di /api verso il PHP locale
//   (php -S localhost:8000 nella root del progetto).
export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === 'build' ? '/experiments/death-star-promo/' : '/',
    server: {
        port: 5173,
        open: true,
        proxy: {
            '/api': { target: 'http://localhost:8000', changeOrigin: true },
        },
    },
    build: {
        target: 'es2020',
        chunkSizeWarningLimit: 1400,
        rollupOptions: {
            output: {
                // librerie in chunk separati: cache del browser tra un
                // deploy e l'altro (cambia solo il codice dell'app)
                manualChunks: {
                    three: ['three'],
                    r3f: ['@react-three/fiber', '@react-three/drei'],
                    fx: ['postprocessing', '@react-three/postprocessing'],
                    motion: ['gsap', 'lenis'],
                },
            },
        },
    },
}));
