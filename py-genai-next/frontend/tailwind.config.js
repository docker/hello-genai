import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
        },
        brand2: "hsl(var(--brand-2))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
      },
      borderRadius: {
        none: "0px",
        sm: "max(0px, calc(var(--radius) - 2px))",
        DEFAULT: "var(--radius)",
        md: "var(--radius)",
        lg: "calc(var(--radius) + 2px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 6px)",
        "3xl": "calc(var(--radius) + 10px)",
        full: "9999px",
      },
      fontFamily: {
        // Driven by the user's typeface pref (see index.css / lib/prefs.ts)
        sans: ["var(--font-sans)"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      letterSpacing: {
        tightish: "-0.011em",
        heading: "-0.021em",
      },
      // Soft, layered, slate-tinted elevation — professional depth, not hard drop-shadows.
      boxShadow: {
        xs: "0 1px 2px 0 hsl(222 47% 11% / 0.05)",
        sm: "0 1px 2px 0 hsl(222 47% 11% / 0.05), 0 1px 1px -1px hsl(222 47% 11% / 0.04)",
        DEFAULT: "0 1px 3px 0 hsl(222 47% 11% / 0.06), 0 1px 2px -1px hsl(222 47% 11% / 0.05)",
        md: "0 4px 14px -3px hsl(222 47% 11% / 0.09), 0 2px 6px -2px hsl(222 47% 11% / 0.05)",
        lg: "0 14px 32px -10px hsl(222 47% 11% / 0.14), 0 4px 10px -4px hsl(222 47% 11% / 0.07)",
        xl: "0 28px 56px -14px hsl(222 47% 11% / 0.22), 0 10px 20px -10px hsl(222 47% 11% / 0.12)",
        "2xl": "0 40px 80px -20px hsl(222 47% 11% / 0.28)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(12px) scale(0.96)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "toast-bar": { from: { transform: "scaleX(1)" }, to: { transform: "scaleX(0)" } },
        reveal: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s cubic-bezier(0.22,1,0.36,1)",
        "toast-in": "toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        "toast-bar": "toast-bar var(--toast-ms,6s) linear forwards",
        reveal: "reveal 0.6s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [animate],
};
