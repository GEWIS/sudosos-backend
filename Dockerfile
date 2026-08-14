# Build in a different image to keep the target image clean
FROM node:22.22.1-alpine3.23 AS build

RUN apk add --no-cache python3 make g++ py3-setuptools

WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm ci
COPY ./ ./
RUN npm run build \
 && npm run swagger
RUN HUSKY=0 npm ci --omit=dev

# The target image that will be run
FROM node:22.22.1-alpine3.23 AS target
RUN apk add --no-cache openssl tini

WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
RUN npm install -g @socket.io/pm2@5.3.0 pm2-graceful-intercom@1.0.1 typeorm@0.3.28

COPY --from=build --chown=node:node /app/init_scripts /app/init_scripts
COPY --from=build --chown=node:node /app/pm2.json /app/pm2.json
RUN chmod +x /app/init_scripts/start.sh \
 && chmod +x /app/init_scripts/00_make_sudosos_data_dirs.sh \
 && chmod +x /app/init_scripts/00_regen_sudosos_secrets.sh

COPY --from=build --chown=node:node /app/out/src /app/out/src
COPY --from=build --chown=node:node /app/out/swagger.json /app/out/swagger.json
COPY --from=build --chown=node:node /app/static /app/out/static

USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "/app/init_scripts/start.sh"]
