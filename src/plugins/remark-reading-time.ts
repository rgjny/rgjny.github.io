import type { RemarkPlugin } from '@astrojs/markdown-remark'
import getReadingTime from 'reading-time'
import { toString } from 'mdast-util-to-string'

const remarkReadingTime: RemarkPlugin = (_options?) => {
  return function (tree, { data }) {
    if (data.astro?.frontmatter) {
      const textOnPage = toString(tree)
      const readingTime = getReadingTime(textOnPage)
      // readingTime.text will give us minutes read as a friendly string,
      // i.e. "3 min read"
      data.astro.frontmatter.minutesRead = readingTime.text
      // Expose raw minutes + word count for the post banner meta row.
      data.astro.frontmatter.minutes = Math.max(1, Math.round(readingTime.minutes))
      data.astro.frontmatter.wordsCount = readingTime.words
    }
  }
}

export default remarkReadingTime
