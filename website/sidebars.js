/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/idempotent-init',
        'guides/columns-and-types',
        'guides/foreign-keys',
        'guides/dependencies-and-waits',
        'guides/events',
        'guides/retries-and-errors',
        'guides/migrating-from-1x'
      ]
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['api/index']
    }
  ]
}

module.exports = sidebars
