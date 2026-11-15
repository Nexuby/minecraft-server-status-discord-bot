FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production DATA_DIR=/app/data
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
RUN mkdir /app/data && chown node:node /app/data
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "const fs=require('node:fs');try{const s=JSON.parse(fs.readFileSync((process.env.DATA_DIR||'/app/data')+'/health.json'));process.exit(s.ready&&Date.now()-s.at<60000?0:1)}catch{process.exit(1)}"
CMD ["node", "dist/index.js"]
