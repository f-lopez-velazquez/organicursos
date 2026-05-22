import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        slate: {
          975: "#05070b",
          950: "#0a0f17",
          925: "#111826",
          875: "#151f31",
        },
        atlas: {
          50: "#f3f8ff",
          100: "#d6e6ff",
          200: "#accdff",
          300: "#78acff",
          400: "#4b88f0",
          500: "#2e6bd8",
          600: "#214ea6",
          700: "#1a3e80",
          800: "#152f5d",
          900: "#0f2243",
        },
        accent: {
          teal: "#57d9c4",
          gold: "#d7b571",
          rose: "#d97c93",
        },
      },
      boxShadow: {
        glow: "0 20px 80px rgba(46, 107, 216, 0.18)",
        panel: "0 18px 50px rgba(0, 0, 0, 0.32)",
      },
      backgroundImage: {
        "hero-radial":
          "radial-gradient(circle at top, rgba(87, 217, 196, 0.16), transparent 38%), radial-gradient(circle at 85% 10%, rgba(215, 181, 113, 0.12), transparent 30%), linear-gradient(180deg, rgba(10,15,23,0.98), rgba(5,7,11,1))",
      },
      fontFamily: {
        sans: [
          "Aptos",
          '"Segoe UI Variable Display"',
          '"Segoe UI"',
          '"SF Pro Display"',
          '"IBM Plex Sans"',
          '"Helvetica Neue"',
          "sans-serif",
        ],
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
