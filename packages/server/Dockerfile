# syntax=docker/dockerfile:1
#
# SideButton MCP server — the image published to the Docker MCP Catalog.
#
# Build from the REPOSITORY ROOT. @sidebutton/server depends on @sidebutton/core
# through `workspace:*`, so the pnpm workspace has to stay intact and the build
# context cannot be narrowed to packages/server:
#
#   docker build -f packages/server/Dockerfile -t mcp/sidebutton .
#
# Speak MCP over stdio, the way an MCP client starts it:
#
#   docker run -i --rm mcp/sidebutton
#
# Scope: the 22 browser tools drive real Chrome through the SideButton
# extension, which connects to a server on the *host's* 127.0.0.1:9876. A
# container cannot serve them (in stdio mode the HTTP side binds container-local
# loopback by design). Workflow, run-log, artifact and knowledge-pack tools work
# fully. See packages/server/README.md § Run with Docker.

FROM node:22-slim AS base
# pnpm is pinned to the root package.json `packageManager` version. Installed
# via npm rather than corepack: same pinning, without corepack's signature
# checks and download prompt, which are a recurring source of build breakage.
RUN npm install -g pnpm@9.15.1
# The repo's root .npmrc sets node-linker=hoisted, which flattens EVERY
# workspace's dependencies into one tree — 1.1 GB of website/desktop packages
# for a server that needs 97 MB. It is deliberately never copied into any
# stage, so pnpm's default isolated linker honours the --filter below.
WORKDIR /app

# ---------------------------------------------------------------------------
# deps — production dependencies only, resolved from the committed lockfile
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
# --frozen-lockfile keeps nightly rebuilds of a pinned commit reproducible.
# confirmModulesPurge=false: pnpm otherwise prompts before replacing an existing
# node_modules, which has no answer in a non-interactive build.
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false \
    --prod --filter "@sidebutton/server..."

# ---------------------------------------------------------------------------
# builder — dev dependencies + TypeScript build
# ---------------------------------------------------------------------------
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false \
    --filter "@sidebutton/server..."
# Sources are copied by explicit path: a `COPY packages/server/ .` would carry a
# developer's untracked packages/server/.env into the image, and cli.ts does
# `import 'dotenv/config'` from the working directory.
COPY packages/core/tsconfig.json packages/core/tsup.config.ts packages/core/
COPY packages/core/src packages/core/src
COPY packages/server/tsconfig.json packages/server/tsup.config.ts packages/server/
COPY packages/server/src packages/server/src
# build:server is tsup alone. The full `build` also builds the browser dashboard,
# which an MCP client never loads; server.ts serves it only if the directory is
# present, so leaving it out is a supported configuration.
RUN pnpm --filter @sidebutton/core build \
    && pnpm --filter @sidebutton/server build:server

# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM node:22-slim AS runner
# git: knowledge-pack registries are git clones (packages/server/src/registry.ts).
# ca-certificates: HTTPS to those registries and to the portal API.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# node:22-slim ships an unprivileged `node` user (uid 1000); HOME is set
# explicitly because the config directory is resolved from $HOME and falls back
# to the working directory when it is unset.
ENV HOME=/home/node \
    NODE_ENV=production \
    SIDEBUTTON_CONTAINER=1

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps --chown=node:node /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=builder --chown=node:node /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=node:node /app/packages/server/dist ./packages/server/dist
COPY --chown=node:node packages/core/package.json ./packages/core/
COPY --chown=node:node packages/server/package.json ./packages/server/
COPY --chown=node:node packages/server/bin ./packages/server/bin
COPY --chown=node:node packages/server/defaults ./packages/server/defaults

USER node

# Dashboard/REST port, used only when the command is overridden to `serve`.
# Under stdio (the default) nothing is published: see the scope note above.
EXPOSE 9876

# First run seeds $HOME/.sidebutton from packages/server/defaults. Mount a
# volume there to keep workflows, run logs and installed packs across restarts.
ENTRYPOINT ["node", "/app/packages/server/bin/sidebutton.js"]
CMD ["serve", "--stdio"]
