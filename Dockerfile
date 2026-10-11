# ---- builder: install everything (build needs devDependencies) and compile ----
FROM node:24 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: production dependencies + compiled output only ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
EXPOSE 4173
VOLUME /data
CMD ["node", "dist/apps/server/src/main.js", "--host=0.0.0.0", "--port=4173", "--data-directory=/data", "--logs-directory=/data/logs"]
