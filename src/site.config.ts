import type { SiteConfig } from '~/types'

const config: SiteConfig = {
  site: 'https://rgjny.me/',
  title: "Rgjny's Blog",
  description: 'Bug bounty writeups & cybersecurity research',
  author: 'rgjny',
  tags: ['Bug Bounty', 'Cybersecurity'],
  socialCardAvatarImage: './src/content/avatar.jpg',
  // Type is driven from global.css — JetBrains Mono (display/labels) + DM Sans (body).
  // This value only feeds the social-card renderer.
  font: 'DM Sans',
  pageSize: 6,
  trailingSlashes: false,
  navLinks: [
    { name: 'Home',   url: '/' },
    { name: 'Posts',  url: '/posts' },
    { name: 'About',  url: '/about' },
    { name: 'GitHub', url: 'https://github.com/rgjny', external: true },
  ],
  // Single theme — dark/light switching is handled by JS toggle in Header.astro
  themes: {
    mode: 'single',
    default: 'github-dark',
    include: ['github-dark'],
    overrides: {
      'github-dark': {
        // Base palette — our CSS vars override most of this at the :root level.
        // These are only used where the theme system injects variables directly.
        'background':        'oklch(0.144 0.022 44)',
        'editor.background': 'oklch(0.144 0.022 44)',
        'foreground':        'oklch(0.883 0.036 74)',
        'editor.foreground': 'oklch(0.883 0.036 74)',
        'accent':            'oklch(0.818 0.134 73)',
        'link':              'oklch(0.818 0.134 73)',
        'border':            'oklch(0.263 0.026 40)',
        'muted-foreground':  'oklch(0.572 0.025 66)',
      },
    },
  },
  socialLinks: {
    github:  'https://github.com/rgjny',
    email:   'rgjnymail@proton.me',
    twitter: 'https://x.com/rgjny_',
    rss: false,
  },
  }

export default config
