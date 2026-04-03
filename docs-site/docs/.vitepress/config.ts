import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'SideButton',
  description: 'Open source knowledge packs for AI agents — domain knowledge, workflows, and browser automation',

  base: '/',

  ignoreDeadLinks: [
    /localhost/
  ],

  // Wrap code blocks with v-pre to prevent Vue interpolation of {{}} syntax
  markdown: {
    config: (md) => {
      const originalFence = md.renderer.rules.fence
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const result = originalFence
          ? originalFence(tokens, idx, options, env, self)
          : self.renderToken(tokens, idx, options)
        return `<div v-pre>${result}</div>`
      }
    }
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'SideButton',

    nav: [
      { text: 'Guide', link: '/installation' },
      { text: 'Workflows', link: '/workflows/overview' },
      { text: 'Knowledge Packs', link: '/knowledge-packs/overview' },
      { text: 'Plugins', link: '/plugins/overview' },
      { text: 'MCP', link: '/mcp/overview' },
      // { text: 'API', link: '/api/rest' }, // Hidden until Phase 2
      {
        text: 'v1.0.12',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Contributing', link: '/contributing' }
        ]
      },
      { text: 'Website', link: 'https://sidebutton.com' }
    ],

    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Welcome', link: '/' },
            { text: 'Installation', link: '/installation' },
            { text: 'Extension Setup', link: '/extension' },
            { text: 'First Workflow', link: '/first-workflow' },
            { text: 'MCP Setup', link: '/mcp-setup' },
            { text: 'Community Roles', link: '/community-roles' },
            { text: 'Troubleshooting', link: '/troubleshooting' }
          ]
        },
        {
          text: 'Workflows',
          items: [
            { text: 'Overview', link: '/workflows/overview' },
            { text: 'DSL Reference', link: '/workflows/dsl' },
            { text: 'Step Types', link: '/workflows/steps' },
            { text: 'Variables', link: '/workflows/variables' },
            { text: 'Examples', link: '/workflows/examples' }
          ]
        },
        {
          text: 'Knowledge Packs',
          items: [
            { text: 'Overview', link: '/knowledge-packs/overview' },
            { text: 'Creating Packs', link: '/knowledge-packs/creating' },
            { text: 'CLI Reference', link: '/knowledge-packs/cli' },
            { text: 'Publishing', link: '/knowledge-packs/cli#creator-commands' }
          ]
        },
        {
          text: 'Plugins',
          items: [
            { text: 'Overview', link: '/plugins/overview' },
            { text: 'Creating Plugins', link: '/plugins/creating' },
            { text: 'CLI Reference', link: '/plugins/cli' },
            { text: 'Available Plugins', link: '/plugins/available' }
          ]
        },
        {
          text: 'Features',
          items: [
            { text: 'Recording Mode', link: '/features/recording' },
            { text: 'Embed Buttons', link: '/features/embed' },
            { text: 'Dashboard', link: '/features/dashboard' },
            { text: 'LLM Integration', link: '/features/llm' },
            { text: 'Jira Integration', link: '/jira-setup' }
          ]
        },
        {
          text: 'MCP Server',
          items: [
            { text: 'Overview', link: '/mcp/overview' },
            { text: 'MCP Tools', link: '/mcp/tools' },
            { text: 'Browser Tools', link: '/mcp/browser' }
          ]
        },
        // API section hidden until Phase 2
        // {
        //   text: 'API',
        //   items: [
        //     { text: 'REST API', link: '/api/rest' }
        //   ]
        // },
        {
          text: 'Reference',
          items: [
            { text: 'Changelog', link: '/changelog' },
            { text: 'Contributing', link: '/contributing' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/sidebutton/sidebutton' }
    ],

    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright 2025-present Max Svistun'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/sidebutton/sidebutton/edit/main/docs-site/docs/:path',
      text: 'Edit this page on GitHub'
    }
  }
})
