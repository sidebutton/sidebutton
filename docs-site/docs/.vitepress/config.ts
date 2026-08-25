import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'SideButton',
  description: 'Open source knowledge packs for AI agents — domain knowledge, workflows, and browser automation',

  base: '/',

  ignoreDeadLinks: [
    /localhost/
  ],

  // Live agent editing sessions reach this dev server through an authenticated
  // proxy chain (portal -> relay -> agent daemon -> 127.0.0.1), so the browser's
  // origin is not the origin the server binds. Vite would reject the proxied Host
  // with a 403 "Blocked request" page, and HMR would dial the dev port directly
  // and never connect. Opt in with SB_DEV_SESSION=1; a plain `npm run dev` is
  // unaffected.
  //
  // The Host is per session — `p-<agentId>-<port>.sidebutton.com` — so the check
  // has to be the suffix rather than one literal name. A leading dot is Vite's
  // "this domain and every subdomain" form, so it still covers the legacy
  // `app.sidebutton.com` path lane, and it stays a real check: anything outside
  // the domain is still refused.
  //
  // The bind moves to the IPv4 loopback for the same reason the website config
  // pins it: a bare `vitepress dev` binds whatever `localhost` resolves to, which
  // on these VMs is `[::1]` only, and the session boot contract declares the
  // server ready by probing `http://127.0.0.1:<port>/` — which is refused while
  // every log line says the server is fine. (The daemon itself dials both
  // loopbacks, so the preview survives either way; the readiness probe does not.)
  vite: {
    server: process.env.SB_DEV_SESSION
      ? {
          host: '127.0.0.1',
          allowedHosts: ['.sidebutton.com'],
          hmr: { clientPort: 443, protocol: 'wss' },
          fs: { strict: true }
        }
      : {}
  },

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
      {
        text: 'Workflows',
        items: [
          { text: 'YAML Workflows', link: '/workflows/overview' },
          { text: 'Orchestrating Agents', link: '/workflows/orchestration' },
          { text: 'Working with Playbooks', link: '/workflows/playbooks' },
          { text: 'Working with Tasks', link: '/workflows/tasks' }
        ]
      },
      { text: 'Knowledge Packs', link: '/knowledge-packs/overview' },
      { text: 'Plugins', link: '/plugins/overview' },
      { text: 'MCP', link: '/mcp/overview' },
      {
        text: 'Features',
        items: [
          { text: 'Dashboard', link: '/features/dashboard' },
          { text: 'LLM Integration', link: '/features/llm' },
          { text: 'AGENTS.md Support', link: '/agents-md' },
          { text: 'Jira Integration', link: '/jira-setup' },
          { text: 'Linear Automations', link: '/linear-automations' },
          { text: 'Notion Boards', link: '/notion-setup' },
          { text: 'Embed Buttons', link: '/features/embed' },
          { text: 'Recording Mode', link: '/features/recording' }
        ]
      },
      {
        text: 'v1.5.5',
        items: [
          { text: 'Release Posts', link: '/releases/' },
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
            { text: 'Self-Host on Your Machine', link: '/self-hosting' },
            { text: 'Extension Setup', link: '/extension' },
            { text: 'First Workflow', link: '/first-workflow' },
            { text: 'MCP Setup', link: '/mcp-setup' },
            { text: 'AGENTS.md Support', link: '/agents-md' },
            { text: 'Community Roles', link: '/community-roles' },
            { text: 'Troubleshooting', link: '/troubleshooting' }
          ]
        },
        {
          text: 'Cloud Agents',
          items: [
            { text: 'Hosted Agents', link: '/cloud/hosted-agents' },
            { text: 'AWS Setup', link: '/cloud/aws-setup' },
            { text: 'Hetzner Setup', link: '/cloud/hetzner-setup' },
            { text: 'GCP Setup', link: '/cloud/gcp-setup' },
            { text: 'Self-Host in Your Cloud', link: '/cloud/create-agent' },
            { text: 'Connect Claude Subscription', link: '/cloud/claude-subscription' }
            // Side Projects (/cloud/side-projects) is excluded from the OSS sync (sync-oss.sh);
            // keep it out of the nav so the synced config never links a page the mirror doesn't have.
            // Reachable by direct URL in local dev. Re-list when/if the page goes public (D4).
          ]
        },
        {
          text: 'Workflows',
          items: [
            { text: 'Overview', link: '/workflows/overview' },
            { text: 'Orchestrating Agents', link: '/workflows/orchestration' },
            { text: 'Working with Playbooks', link: '/workflows/playbooks' },
            { text: 'Working with Tasks', link: '/workflows/tasks' },
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
            { text: 'Dashboard', link: '/features/dashboard' },
            { text: 'LLM Integration', link: '/features/llm' },
            { text: 'Jira Integration', link: '/jira-setup' },
            { text: 'Linear Automations', link: '/linear-automations' },
            { text: 'Notion Boards', link: '/notion-setup' },
            { text: 'Embed Buttons', link: '/features/embed' },
            { text: 'Recording Mode', link: '/features/recording' }
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
        {
          text: 'Releases & Reference',
          items: [
            { text: 'Release Posts', link: '/releases/' },
            { text: 'Notion, Roles & Workspace Setup', link: '/releases/2026-08-week34' },
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
