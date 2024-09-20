import { defineConfig } from 'vitepress'
import typedocSidebar from '../out/typedoc-sidebar.json'

export default defineConfig({
  title: "SudoSOS Backend",
  base: "/docs/out/",
  description: "Documentation, reference and examples for the SudoSOS Backend",

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Examples', link: '/markdown-examples' },
      { text: 'Swagger', link: 'https://sudosos.gewis.nl/api/api-docs/'},
    ],
    search: {
      provider: 'local'
    },
    sidebar: [
      {
        text: 'API',
        items: typedocSidebar,
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/gewis/sudosos-backend' },
    ],
  },
})
