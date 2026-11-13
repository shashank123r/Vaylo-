import type { Config } from "tailwindcss";

// Vaylo design system. Calm, editorial, neutral-light. One restrained brand
// accent (a muted clay) reserved for active states, links, and meaningful
// highlights — NOT every button. Primary actions use graphite (near-charcoal),
// which reads premium and keeps the accent rare and purposeful. No gradients,
// glassmorphism, neon, or purple.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — barely-warm neutrals, less yellow than before.
        canvas: "#F7F6F3", // page background
        surface: "#FFFFFF", // cards, inputs
        "surface-2": "#FBFAF7", // subtly raised/inset panels
        sidebar: "#F2F1EC", // app navigation rail

        // Text — warm charcoal, not pure black.
        ink: "#232420", // primary text
        "ink-muted": "#6B6F67", // secondary text
        "ink-faint": "#989C92", // tertiary / meta

        // Primary action surface (buttons, selected rows).
        graphite: {
          DEFAULT: "#232420",
          hover: "#3A3C34",
        },

        // Brand accent — muted clay. Used sparingly: links, active nav, focus,
        // key figures, small highlights.
        brick: {
          DEFAULT: "#A8483A",
          hover: "#8F3D30",
          soft: "#F3E8E4", // warm tint background
        },

        // Hairline borders and dividers — cool, subtle, barely there.
        stone: {
          200: "#ECEAE3",
          300: "#DEDBD2",
          400: "#C6C1B5",
        },

        success: "#3C7A51",
        warning: "#A9792C",
        danger: "#B24634",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Deliberate, not oversized. Cards stay tight and architectural.
      borderRadius: {
        md: "8px",
        lg: "10px",
        xl: "14px",
      },
      // Very subtle, cool-tinted elevation — used only to explain layering.
      boxShadow: {
        card: "0 1px 2px rgba(35,36,32,0.03)",
        "card-hover": "0 1px 2px rgba(35,36,32,0.04), 0 6px 16px rgba(35,36,32,0.06)",
        pop: "0 12px 40px rgba(35,36,32,0.14)",
        focus: "0 0 0 3px rgba(168,72,58,0.16)",
      },
      letterSpacing: {
        tightish: "-0.011em",
        tighter2: "-0.021em",
        tighter3: "-0.03em",
      },
      maxWidth: {
        // Consistent content widths across routes.
        content: "72rem", // 1152px — dashboards, lists, workspaces
        reading: "46rem", // 736px — focused forms & reading views
        prose: "38rem", // 608px — auth / single-column
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s cubic-bezier(0.32,0.72,0,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
