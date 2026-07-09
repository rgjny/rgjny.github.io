// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import sitemap from '@astrojs/sitemap'
import mdx from '@astrojs/mdx'
import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import expressiveCode from 'astro-expressive-code'
import siteConfig from './src/site.config'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'
import remarkDescription from './src/plugins/remark-description'
import remarkReadingTime from './src/plugins/remark-reading-time'
import rehypeTitleFigure from './src/plugins/rehype-title-figure'
import { remarkGithubCard } from './src/plugins/remark-github-card'
import rehypeExternalLinks from 'rehype-external-links'
import remarkDirective from 'remark-directive'
import rehypeUnwrapImages from 'rehype-unwrap-images'
import { remarkAdmonitions } from './src/plugins/remark-admonitions'
import remarkCharacterDialogue from './src/plugins/remark-character-dialogue'
import remarkUnknownDirectives from './src/plugins/remark-unknown-directives'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGemoji from './src/plugins/remark-gemoji'
import rehypePixelated from './src/plugins/rehype-pixelated'

export default defineConfig({
  site: 'https://rgjny.me',
  trailingSlash: siteConfig.trailingSlashes ? 'always' : 'never',
  prefetch: true,

  markdown: {
    remarkPlugins: [
      [remarkDescription, { maxChars: 200 }],
      remarkReadingTime,
      remarkDirective,
      remarkGithubCard,
      remarkAdmonitions,
      [remarkCharacterDialogue, { characters: siteConfig.characters }],
      remarkUnknownDirectives,
      remarkMath,
      remarkGemoji,
    ],
    rehypePlugins: [
      [rehypeHeadingIds, { headingIdCompat: true }],
      [rehypeAutolinkHeadings, { behavior: 'wrap' }],
      rehypeTitleFigure,
      [
        rehypeExternalLinks,
        {
          rel: ['noreferrer', 'noopener'],
          target: '_blank',
        },
      ],
      rehypeUnwrapImages,
      rehypePixelated,
      rehypeKatex,
    ],
  },

  image: {
    responsiveStyles: true,
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    sitemap(),
    expressiveCode({
      themes: siteConfig.themes.include,
      useDarkModeMediaQuery: false,
      defaultProps: {
        showLineNumbers: false,
        wrap: false,
      },
      plugins: [pluginLineNumbers()],
    }),
    mdx(),
  ],

  experimental: {
    contentIntellisense: true,
  },
})
