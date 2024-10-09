import { defineConfig } from 'vitepress'
import typedocSidebar from '../content/typedoc/typedoc-sidebar.json'

const apiItems = typedocSidebar.filter((item: any) => !['helpers', 'internal', 'gewis'].includes(item.text.toLowerCase()));
const internalsItems = typedocSidebar.filter((item: any) => ['helpers', 'internal', 'gewis'].includes(item.text.toLowerCase()));

export default defineConfig({
  title: "SudoSOS Backend",
  srcDir: "./content",
  base: "/docs/",
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
        ],
      },
      {
        text: 'Documentation',
        items: [{text: 'Introduction', link: '/documentation'}, ...apiItems],
      },
      {
        text: 'Internals',
        items: [{text: "TypeDoc", link: '/typedoc'}, ...internalsItems],
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/gewis/sudosos-backend' },
    ],
  },
})
