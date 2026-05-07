/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'bg-slate-100', 'bg-white', 'bg-teal-700', 'bg-teal-600',
    'bg-[#111b21]', 'bg-[#1f2c34]', 'bg-[#202c33]', 'bg-[#005c4b]',
    'bg-[#0b141a]', 'bg-[#2a3942]', 'bg-[#233138]',
    'text-white', 'text-gray-100', 'text-gray-800', 'text-gray-400',
    'text-gray-500', 'text-teal-100', 'text-teal-200/70', 'text-teal-300',
    'border-slate-200', 'border-[#2a373f]', 'border-white/5',
    'hover:bg-teal-700', 'hover:bg-teal-500',
  ],
  theme: { extend: {} },
  plugins: [],
}
