# Build in a different image to keep the target image clean
FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ py3-setuptools
RUN npm install -g pnpm@10.33.0

WORKDIR /app
COPY ./package.json ./pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY ./ ./
RUN pnpm build \
 && pnpm swagger
RUN HUSKY=0 pnpm install --prod --frozen-lockfile

# The target image that will be run
FROM node:22-alpine AS target
RUN apk add openssl

WORKDIR /app
COPY --from=build --chown=node /app/node_modules /app/node_modules
RUN npm install -g typeorm

COPY --from=build --chown=node /app/init_scripts /app/init_scripts
RUN chmod +x /app/init_scripts/*.sh

COPY --from=build --chown=node /app/out/src /app/out/src
COPY --from=build --chown=node /app/out/swagger.json /app/out/swagger.json
COPY --from=build --chown=node /app/static /app/out/static

CMD ["/app/init_scripts/start.sh"]
