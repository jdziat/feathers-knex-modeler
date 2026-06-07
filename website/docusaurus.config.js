// @ts-check

const repoUrl = 'https://github.com/jdziat/feathers-knex-modeler'
const npmUrl = 'https://www.npmjs.com/package/feathers-knex-modeler'

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Feathers Knex Modeler',
  tagline: 'Idempotent Knex table creation and extension for Feathers and Node.js apps',
  favicon: 'img/favicon.ico',
  url: 'https://jdziat.github.io',
  baseUrl: '/feathers-knex-modeler/',
  organizationName: 'jdziat',
  projectName: 'feathers-knex-modeler',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en']
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js')
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      })
    ]
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Feathers Knex Modeler',
        items: [
          { to: '/', label: 'Docs', position: 'left' },
          { to: '/getting-started', label: 'Getting Started', position: 'left' },
          { to: '/api/', label: 'API', position: 'left' },
          { href: repoUrl, label: 'GitHub', position: 'right' },
          { href: npmUrl, label: 'npm', position: 'right' }
        ]
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Getting Started', to: '/getting-started' },
              { label: 'API Reference', to: '/api/' },
              { label: 'Migrating from 1.x', to: '/guides/migrating-from-1x' }
            ]
          },
          {
            title: 'Package',
            items: [
              { label: 'GitHub', href: repoUrl },
              { label: 'npm', href: npmUrl }
            ]
          }
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Jordan Dziat.`
      },
      prism: {
        additionalLanguages: ['typescript']
      }
    })
}

module.exports = config
