# Build in a different image to keep the target image clean
FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ py3-setuptools

WORKDIR /app
COPY ./package.json ./yarn.lock ./
RUN yarn install --frozen-lockfile
COPY ./ ./
RUN yarn build \
 && yarn swagger
RUN HUSKY=0 yarn install --production --frozen-lockfile

# The target image that will be run
FROM node:22-alpine AS target
RUN apk add openssl

WORKDIR /app
COPY --from=build --chown=node /app/node_modules /app/node_modules
RUN yarn global add @socket.io/pm2 pm2-graceful-intercom typeorm

COPY --from=build --chown=node /app/init_scripts /app/init_scripts
COPY --from=build --chown=node /app/pm2.json /app/pm2.json
RUN chmod +x /app/init_scripts/start.sh

COPY --from=build --chown=node /app/out/src /app/out/src
COPY --from=build --chown=node /app/out/swagger.json /app/out/swagger.json
COPY --from=build --chown=node /app/static /app/out/static

CMD ["sh", "/app/init_scripts/start.sh"]
