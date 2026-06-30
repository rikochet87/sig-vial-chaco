import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2C2C2C',
        accent: '#F5C300',
        surface: '#3C3C3C',
        bg: '#1A1A1A',
        muted: '#9E9E9E',
      },
    },
  },
  plugins: [],
}
export default config
