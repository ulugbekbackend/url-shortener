# Node 24 is the active LTS (Node 20 reached end-of-life on 2026-04-30)
FROM node:24-alpine

# Run as the image's unprivileged "node" user. Files are copied with that owner:
# a later `chown -R` would duplicate node_modules into another layer.
WORKDIR /app
RUN chown node:node /app
USER node

# Dependencies first, so code changes don't invalidate this layer
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .

EXPOSE 3000

# Dev server, reachable from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
