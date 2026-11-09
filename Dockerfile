FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY services/policy/package.json services/policy/package.json
COPY services/api/package.json services/api/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN pnpm install --no-frozen-lockfile
COPY services/policy services/policy
COPY services/api services/api
RUN pnpm --filter @outlay/policy build && pnpm --filter @outlay/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/policy ./services/policy
COPY --from=build /app/services/api/node_modules ./services/api/node_modules
COPY --from=build /app/services/policy/node_modules ./services/policy/node_modules
COPY --from=build /app/services/api/package.json ./services/api/package.json
COPY --from=build /app/services/api/dist ./services/api/dist
COPY --from=build /app/services/api/migrations ./services/api/migrations
WORKDIR /app/services/api
EXPOSE 8787
CMD ["node", "dist/server.js"]
