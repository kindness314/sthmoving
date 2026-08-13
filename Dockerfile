FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.base.json tsconfig.server.build.json ./
COPY cloudfunctions/api/src ./cloudfunctions/api/src
COPY server ./server
RUN npm run build:server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/package.json ./server/package.json
COPY server/migrations ./server/migrations
COPY --from=build /app/server/dist ./server/dist
RUN mkdir -p /var/lib/sthmoving/files && chown -R node:node /var/lib/sthmoving
USER node
EXPOSE 8080
CMD ["node", "server/dist/server/src/main.js"]
