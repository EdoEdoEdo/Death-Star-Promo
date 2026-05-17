import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In produzione (build) il sito vive in una sottocartella su Aruba.
// In dev (vite dev) usa root standard per non rompere HMR.
export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === 'build' ? '/experiments/death-star-promo/' : '/',
    server: { port: 5173, open: true },
}));
