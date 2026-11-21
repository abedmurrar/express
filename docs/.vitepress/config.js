import { slug } from 'github-slugger'
import { defineConfig } from 'vitepress'

const repo = 'https://github.com/abedmurrar/express'
const site = 'https://abedmurrar.github.io/express/'
const name = 'Express fork'
const description =
  'Docs for abedmurrar/express, an unofficial fork of Express: a drop-in replacement for Express 5.3.0 on Node.js 22, 24 and 26. Not the official Express project.'

export default defineConfig({
  lang: 'en-US',
  title: name,
  titleTemplate: `:title | ${name} (unofficial)`,
  description,
  base: '/express/',

  // Pages are served without .html (GitHub Pages resolves /guide/routing to
  // guide/routing.html), so the canonical URLs and the sitemap use that form.
  cleanUrls: true,
  sitemap: { hostname: site },
  // The date each page last changed, from git.
  lastUpdated: true,

  head: [
    ['meta', { name: 'theme-color', content: '#0f766e' }],
    ['meta', { property: 'og:site_name', content: name }],
    ['meta', { property: 'og:type', content: 'website' }]
  ],

  markdown: {
    // The same heading ids as expressjs.com (GitHub style: `res.render()`
    // becomes `resrender`), so the ported in-page links keep working.
    anchor: { slugify: slug }
  },

  // A canonical URL per page.
  transformPageData(pageData) {
    if (pageData.isNotFound) {
      return
    }
    const url = site + pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }]
    )
  },

  themeConfig: {
    siteTitle: 'Express fork <span class="unofficial-badge">unofficial</span>',

    search: { provider: 'local' },

    socialLinks: [{ icon: 'github', link: repo }],

    editLink: {
      pattern: `${repo}/edit/master/docs/:path`,
      text: 'Edit this page on GitHub'
    },

    nav: [
      { text: 'Getting started', link: '/starter/installing', activeMatch: '^/starter/' },
      { text: 'Guide', link: '/guide/routing', activeMatch: '^/guide/' },
      { text: 'API 5.x', link: '/api/', activeMatch: '^/api/' },
      { text: 'Advanced', link: '/advanced/best-practice-security', activeMatch: '^/advanced/' },
      // The fork's own section stands out in the nav (styled in theme/custom.css).
      {
        text: '<span class="fork-nav">Fork</span><span class="fork-nav-badge">ours</span>',
        link: '/fork/',
        activeMatch: '^/fork/'
      }
    ],

    sidebar: {
      '/starter/': section('Getting started', '/starter/', {
        installing: 'Installing',
        'hello-world': 'Hello world',
        generator: 'Express generator',
        'basic-routing': 'Basic routing',
        'static-files': 'Static files',
        examples: 'More examples',
        faq: 'FAQ'
      }),

      '/guide/': section('Guide', '/guide/', {
        routing: 'Routing',
        'writing-middleware': 'Writing middleware',
        'using-middleware': 'Using middleware',
        'using-template-engines': 'Using template engines',
        'error-handling': 'Error handling',
        debugging: 'Debugging',
        'behind-proxies': 'Express behind proxies',
        'database-integration': 'Database integration',
        'overriding-express-api': 'Overriding the Express API',
        'migrating-5': 'Migrating to Express 5'
      }),

      '/api/': section('API reference (5.x)', '/api/', {
        '': 'Overview',
        express: 'express()',
        application: 'Application',
        request: 'Request',
        response: 'Response',
        router: 'Router'
      }),

      '/advanced/': section('Advanced topics', '/advanced/', {
        'developing-template-engines': 'Building template engines',
        'best-practice-security': 'Security best practices',
        'best-practice-performance': 'Performance best practices',
        'healthcheck-graceful-shutdown': 'Health checks and graceful shutdown'
      }),

      '/fork/': section('Fork', '/fork/', {
        '': 'Overview',
        differences: 'Differences from Express 5.3.0',
        compatibility: 'Compatibility promise',
        benchmarks: 'Benchmarks',
        roadmap: 'Roadmap',
        install: 'Install the fork'
      })
    },

    outline: { level: [2, 3] },

    footer: {
      message:
        'An unofficial fork of <a href="https://expressjs.com">Express</a>, not the official project. Code: MIT. Docs adapted from <a href="https://github.com/expressjs/expressjs.com">expressjs.com</a> by the Express contributors, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, with changes (<a href="/express/LICENSE">details</a>).',
      copyright: 'Express docs © The Express Contributors. Fork additions © 2026-present Abed Murrar.'
    }
  }
})

function section(text, base, pages) {
  return [
    {
      text,
      items: Object.entries(pages).map(([page, title]) => ({
        text: title,
        link: base + page
      }))
    }
  ]
}
