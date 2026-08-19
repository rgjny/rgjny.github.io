import type { SiteConfig } from '~/types'

const config: SiteConfig = {
  site: 'https://rgjny.me/',
  title: "Rgjny's Blog",
  description: 'Bug bounty writeups & cybersecurity research',
  author: 'rgjny',
  tags: ['Bug Bounty', 'Cybersecurity'],
  socialCardAvatarImage: './src/content/avatar.jpg',
  // Browser typography is driven from global.css; this only feeds the social-card renderer.
  font: 'Inter',
  pageSize: 6,
  trailingSlashes: false,
  navLinks: [
    { name: 'Home',   url: '/' },
    { name: 'Posts',  url: '/posts' },
    { name: 'About',  url: '/about' },
    { name: 'GitHub', url: 'https://github.com/rgjny', external: true },
  ],
  // Single theme - dark/light switching is handled by JS toggle in Header.astro
  themes: {
    mode: 'single',
    default: 'github-dark',
    include: ['github-dark'],
    overrides: {
      'github-dark': {
        // Base palette - our CSS vars override most of this at the :root level.
        // These are only used where the theme system injects variables directly.
        'background':        '#12100e',
        'editor.background': '#12100e',
        'foreground':        '#ece7df',
        'editor.foreground': '#ece7df',
        'accent':            '#e08a5a',
        'link':              '#e08a5a',
        'border':            '#2c2824',
        'muted-foreground':  '#a49a8c',
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
