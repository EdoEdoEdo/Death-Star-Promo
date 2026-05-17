/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                sith: {
                    black: '#05060a',
                    ink: '#0b0d14',
                    panel: '#10131c',
                    red: '#ff2a2a',
                    'red-glow': '#ff5252',
                    gold: '#ffe81f',
                    steel: '#9aa3b2',
                },
            },
            fontFamily: {
                crawl: ['"Pathway Gothic One"', 'Impact', 'sans-serif'],
                jedi: ['"Star Jedi"', 'Impact', 'sans-serif'],
                jediHollow: ['"Star Jedi Hollow"', 'Impact', 'sans-serif'],
                jediSe: ['"Star Jedi SE"', 'Impact', 'sans-serif'],
                display: ['Orbitron', 'system-ui', 'sans-serif'],
                body: ['Inter', 'system-ui', 'sans-serif'],
            },
            boxShadow: {
                saber: '0 0 20px rgba(255,42,42,0.7), 0 0 60px rgba(255,82,82,0.45)',
                gold: '0 0 24px rgba(255,232,31,0.45)',
            },
        },
    },
    plugins: [],
};
