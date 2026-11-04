ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json ./
COPY scripts/build.mjs ./scripts/build.mjs
COPY public ./public
RUN npm run build

FROM ${NODE_IMAGE}
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
