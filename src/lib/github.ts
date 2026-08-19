/**
 * Cached GitHub profile data for the social hover card.
 * Fetched once per build (module-level memo) with safe fallbacks so a network
 * hiccup in CI never breaks the build — missing stats are simply hidden.
 */
export interface GitHubCardData {
  total: number | null
  followers: number | null
  weeks: number[][] // recent weeks, each a list of contribution levels (0–4)
}

let cache: Promise<GitHubCardData> | null = null

async function load(username: string): Promise<GitHubCardData> {
  const out: GitHubCardData = { total: null, followers: null, weeks: [] }

  try {
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`)
    if (res.ok) {
      const data = (await res.json()) as {
        total?: Record<string, number>
        contributions: { date: string; count: number; level: number }[]
      }
      out.total = data.total?.lastYear ?? null
      const recent = data.contributions.slice(-16 * 7) // ~16 weeks
      for (let i = 0; i < recent.length; i += 7) {
        out.weeks.push(recent.slice(i, i + 7).map((c) => c.level))
      }
    }
  } catch {
    /* ignore — grid/total just stay empty */
  }

  try {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: { 'User-Agent': 'rgjny-site', Accept: 'application/vnd.github+json' },
    })
    if (res.ok) {
      const user = (await res.json()) as { followers?: number }
      out.followers = user.followers ?? null
    }
  } catch {
    /* ignore — followers hidden */
  }

  return out
}

export function getGitHubCard(username: string): Promise<GitHubCardData> {
  if (!cache) cache = load(username)
  return cache
}
