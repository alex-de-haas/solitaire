FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY public ./public
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY package.json ./
COPY scripts/server.mjs ./scripts/server.mjs
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "scripts/server.mjs", "dist"]
