/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  safelist: [
    // Score badge backgrounds
    'bg-green-500', 'text-white',
    'bg-yellow-400', 'text-gray-900',
    'bg-red-500',
    'bg-gray-700', 'text-gray-400',
    // Score text colors used in ReviewCard
    'text-green-400', 'text-yellow-400', 'text-red-400',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
