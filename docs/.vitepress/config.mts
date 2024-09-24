import { defineConfig } from 'vitepress'
import typedocSidebar from '../out/typedoc-sidebar.json'

const apiItems = typedocSidebar.filter((item: any) => !['helpers', 'internal', 'gewis'].includes(item.text.toLowerCase()));
const internalsItems = typedocSidebar.filter((item: any) => ['helpers', 'internal', 'gewis'].includes(item.text.toLowerCase()));

export default defineConfig({
  title: "SudoSOS Backend",
  base: "/docs/out/",
  description: "Documentation, reference and examples for the SudoSOS Backend",

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Documentation', link: '/documentation' },
      { text: 'Swagger', link: 'https://sudosos.gewis.nl/api/api-docs/'},
    ],
    search: {
      provider: 'local'
    },
    sidebar: [
      {
        text: 'General',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: '.env', link: '/env-variables' },
        ]
        // items: [
          // { text: 'Introduction', link: '/' },
          // { text: 'Installation', link: '/installation' },
          // { text: 'Configuration', link: '/configuration' },
          // { text: 'Database', link: '/database' },
        // ],
      },
      {
        text: 'Documentation',
        items: [{text: 'Introduction', link: '/documentation'}, ...apiItems],
      },
      {
        text: 'Internals',
        items: internalsItems,
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/gewis/sudosos-backend' },
    ],
  },
})
