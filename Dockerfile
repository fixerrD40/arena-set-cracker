# Stage 1: Build Angular app (browser bundle only; no Electron/SQLite native bits needed at runtime)
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 still installs with the lockfile; give node-gyp a normal Debian toolchain.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# Web image does not need native rebuilds; ignore-scripts skips better-sqlite3 compile.
RUN npm install --ignore-scripts

COPY . .
RUN npx ng build --configuration production --verbose

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist/arena-set-cracker/browser/ /usr/share/nginx/html
COPY default.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 443
ENTRYPOINT ["/entrypoint.sh"]
