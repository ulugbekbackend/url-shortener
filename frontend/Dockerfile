# Node 24 is the active LTS (Node 20 reached end-of-life on 2026-04-30)
FROM node:24-alpine

WORKDIR /app

# Dependencies first, so code changes don't invalidate this layer
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# The official image ships an unprivileged "node" user
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Dev server, reachable from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
