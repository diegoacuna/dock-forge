import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "var(--foreground)",
        fog: "var(--background)",
        accent: "var(--accent)",
        teal: "var(--success)",
        rose: "var(--danger)",
        panel: "var(--panel)",
        "panel-muted": "var(--panel-muted)",
        border: "var(--border)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        panel: "0 20px 40px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
