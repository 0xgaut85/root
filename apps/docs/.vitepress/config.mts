import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Root Network',
  titleTemplate: ':title · Root Network Protocol',
  description:
    'Protocol documentation for Root Network: how idle home bandwidth becomes verified infrastructure for AI research, and how contributors get paid.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: false,
  appearance: 'force-dark',
  sitemap: { hostname: 'https://read.rootnetwork.co' },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'preload', href: '/fonts/die_grotesk_b_regular.woff2', as: 'font', type: 'font/woff2', crossorigin: '' }],
    ['link', { rel: 'preload', href: '/fonts/die_grotesk_b_medium.woff2', as: 'font', type: 'font/woff2', crossorigin: '' }],
    ['link', { rel: 'preload', href: '/fonts/dm_mono_regular.woff2', as: 'font', type: 'font/woff2', crossorigin: '' }],
    ['meta', { name: 'theme-color', content: '#000000' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Root Network' }],
    ['meta', { property: 'og:image', content: 'https://read.rootnetwork.co/og.jpg' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:site', content: '@rootnetworkco' }],
  ],
  themeConfig: {
    logo: { src: '/logo-white.png', alt: 'Root Network' },
    siteTitle: 'Root Network',
    nav: [
      { text: 'Protocol', link: '/', activeMatch: '^/(?!$)' },
      { text: 'Website', link: 'https://rootnetwork.co' },
      { text: 'Start earning', link: 'https://earn.rootnetwork.co' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting started', link: '/' },
          { text: 'What is Root Network', link: '/introduction/what-is-root-network' },
          { text: 'How it works', link: '/introduction/how-it-works' },
          { text: 'FAQ', link: '/introduction/faq' },
        ],
      },
      {
        text: 'Guide',
        items: [
          { text: 'Set up Root Network', link: '/guide/set-up' },
          { text: 'Earnings', link: '/guide/earnings' },
          { text: 'Allocation controls', link: '/guide/allocation' },
          { text: 'Payouts', link: '/guide/payouts' },
          { text: 'Referrals', link: '/guide/referrals' },
        ],
      },
      {
        text: 'Architecture',
        items: [
          { text: 'Overview', link: '/architecture/overview' },
          { text: 'Root Node', link: '/architecture/root-node' },
          { text: 'Routers', link: '/architecture/routers' },
          { text: 'Validators', link: '/architecture/validators' },
          { text: 'Bandwidth proofs', link: '/architecture/bandwidth-proofs' },
          { text: 'Contribution ledger', link: '/architecture/contribution-ledger' },
          { text: 'Node reputation', link: '/architecture/node-reputation' },
        ],
      },
      {
        text: 'Data & privacy',
        items: [
          { text: 'Data sovereignty', link: '/data/data-sovereignty' },
          { text: 'Privacy & security', link: '/data/privacy-and-security' },
          { text: 'Acceptable use', link: '/data/acceptable-use' },
        ],
      },
      {
        text: 'Economics',
        items: [
          { text: 'How Root Network makes money', link: '/economics/how-we-make-money' },
          { text: 'Pricing for AI labs', link: '/economics/pricing' },
          { text: 'Contributor payments', link: '/economics/contributor-payments' },
        ],
      },
      {
        text: 'For AI labs',
        items: [
          { text: 'Overview', link: '/labs/overview' },
          { text: 'Access & API', link: '/labs/access' },
        ],
      },
    ],
    outline: { level: [2, 3], label: 'On this page' },
    socialLinks: [{ icon: 'x', link: 'https://x.com/rootnetworkco' }],
    search: {
      provider: 'local',
      options: {
        detailedView: true,
        translations: {
          button: { buttonText: 'Search', buttonAriaLabel: 'Search the protocol docs' },
        },
      },
    },
    docFooter: { prev: 'Previous', next: 'Next' },
    footer: {
      message: 'Root Network Protocol · <a href="https://rootnetwork.co">rootnetwork.co</a> · <a href="https://earn.rootnetwork.co">earn.rootnetwork.co</a>',
      copyright: '© 2026 Root Network',
    },
    externalLinkIcon: false,
  },
});
