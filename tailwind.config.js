/** @type {import('tailwindcss').Config} */

// An opaque palette colour that still takes an opacity (bg-surface-navy/80),
// read from the channels in src/styles/tokens.css.
const channel = (name) => `rgb(var(--rgb-${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Anything under src/components/ui/dev is a dev-only gallery page that lays itself out
    // in its own gallery.css, so its classes stay out of the app's CSS.
    "!./src/components/ui/dev/**",
  ],
  theme: {
    // Everything here EXTENDS Tailwind's defaults. The map's markers and the
    // chrome's greys are Tailwind's own red/yellow/blue/orange/slate/gray, so
    // nothing below may replace a default palette, scale or key: every new
    // colour key is a name Tailwind does not have (surface, ink, accent, info,
    // warn, qty, control, line, tint, shade, scrim, track, data).
    extend: {
      colors: {
        // The five names the app has always used. Same values, now read from the tokens.
        'dcs-dark': channel('window'),
        'dcs-darker': channel('deep'),
        'dcs-navy': channel('navy'),
        'dcs-blue': channel('blue'),
        'dcs-accent': channel('accent'),

        // The design system's names: each --c-* token becomes a key (--c-window -> surface-window, ...).
        surface: {
          window: channel('window'),
          deep: channel('deep'),
          navy: channel('navy'),
          raised: channel('navy-raised'),
          tile: channel('blue'),
          float: channel('float'),
        },
        ink: {
          DEFAULT: channel('text'),
          2: channel('text-2'),
          3: channel('text-3'),
          'on-accent': channel('on-accent'),
        },
        accent: {
          DEFAULT: channel('accent'),
          hover: channel('accent-hover'),
          fg: channel('accent-fg'),
          soft: 'var(--c-accent-soft)',
          'soft-hover': 'var(--c-accent-soft-hover)',
          line: 'var(--c-accent-line)',
        },
        info: { DEFAULT: channel('sky'), soft: 'var(--c-sky-soft)' }, // --c-sky
        warn: channel('warn'),
        qty: channel('qty'),                                          // a loadout's quantities and nothing else (DS22)
        control: channel('outline'),                                  // --c-outline
        line: { DEFAULT: 'var(--c-line)', strong: 'var(--c-line-strong)' },
        tint: { 1: 'var(--c-fill-1)', 2: 'var(--c-fill-2)', 3: 'var(--c-fill-3)' }, // --c-fill-N
        shade: 'var(--c-shade)',
        scrim: 'var(--c-scrim)',
        track: channel('track'),
        // The planner's data colours (protected copies).
        data: {
          target: 'var(--d-target)',
          ip: 'var(--d-ip)',
          nav: 'var(--d-nav)',
          bullseye: 'var(--d-bullseye)',
          departure: 'var(--d-departure)',
          sam: 'var(--d-sam)',
          aaa: 'var(--d-aaa)',
          manpads: 'var(--d-manpads)',
          shorad: 'var(--d-shorad)',
          ewr: 'var(--d-ewr)',
          ring: 'var(--d-ring)',
        },
      },
      fontFamily: {
        // The bundled fonts (src/styles/fonts.css): Figtree for text and JetBrains Mono for `font-mono`.
        // Tailwind's base styles put `html`, `pre` and `code` in these, so the one place the stacks are
        // written is tokens.css.
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        map: ['var(--font-map)'], // today's stack: for what sits on the map
      },
      fontSize: {
        'ui-caption': ['var(--fs-caption)', { lineHeight: '1.3' }],
        'ui-small': ['var(--fs-small)', { lineHeight: 'var(--lh-body)' }],
        'ui-compact': ['var(--fs-compact)', { lineHeight: 'var(--lh-body)' }], // 13, and 15 on a phone
        'ui-body': ['var(--fs-body)', { lineHeight: 'var(--lh-body)' }],
        'ui-lead': ['var(--fs-lead)', { lineHeight: 'var(--lh-body)' }],
        'ui-title': ['var(--fs-title)', { lineHeight: 'var(--lh-tight)' }],
        'ui-headline': ['var(--fs-headline)', { lineHeight: 'var(--lh-tight)' }],
        'ui-display': ['var(--fs-display)', { lineHeight: '1.15' }],
      },
      lineHeight: {
        'ui-tight': 'var(--lh-tight)',
        'ui-body': 'var(--lh-body)',
      },
      letterSpacing: {
        label: '0.06em',
        tag: '0.02em',
        title: '-0.01em',
        display: '-0.015em',
      },
      borderRadius: {
        'ui-xs': 'var(--r-xs)',
        'ui-sm': 'var(--r-sm)',
        'ui-md': 'var(--r-md)',
        'ui-lg': 'var(--r-lg)',
        'ui-xl': 'var(--r-xl)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        'ui-1': 'var(--e-1)',
        'ui-2': 'var(--e-2)',
        'ui-up': 'var(--e-up)',
        halo: '0 0 0 1.5px var(--d-halo)', // the white rim the map puts on its dots
      },
      // Spacing has no override: Tailwind's own scale is already the 4px rhythm the --sp-* tokens use.
      // These add the named sizes (h-tap, min-h-btn-lg, size-badge, w-rail ...).
      spacing: {
        tap: 'var(--tap)',
        'tap-sm': 'var(--tap-sm)',
        'btn-sm': 'var(--h-btn-sm)',
        'btn-lg': 'var(--h-btn-lg)',
        tag: 'var(--tag-h)',
        'bar-btn': 'var(--bar-btn)',
        chip: 'var(--h-chip)',
        'rail-btn': 'var(--h-rail-btn)',
        tab: 'var(--tab)',
        rail: 'var(--rail-w)',
        badge: 'var(--badge)',
      },
      transitionDuration: { fast: 'var(--t-fast)', panel: 'var(--t-panel)' },
      transitionTimingFunction: { ui: 'var(--ease)' },
    },
  },
  plugins: [],
}
