# Shadow bridge worker: Bun (repo scripts) + git + shell + Neovim for agent tooling.
# Use the official Bun image so `bun` is on PATH and linked for musl — copying the binary into
# node:20-alpine can yield exit 127 if the loader or libc layout does not match.
# Build from repo root: bun run docker:build-shadow-node-runner
FROM oven/bun:1.2-alpine
RUN apk add --no-cache bash git neovim
