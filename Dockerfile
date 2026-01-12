# Build in a different image to keep the target image clean
FROM node:18-alpine AS build
WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm install
COPY ./ ./
RUN npm run build \
 && npm run swagger
ENV HUSKY=0
RUN npm ci --production

# The target image that will be run
FROM node:18-alpine AS target

RUN apk add openssl

WORKDIR /app
COPY --from=build --chown=node /app/node_modules /app/node_modules
RUN npm install @socket.io/pm2 pm2-graceful-intercom -g
RUN npm install -g typeorm

COPY --from=build --chown=node /app/init_scripts /app/init_scripts
COPY --from=build --chown=node /app/pm2.json /app/pm2.json
RUN chmod +x /app/init_scripts/start.sh

COPY --from=build --chown=node /app/out/src /app/out/src
COPY --from=build --chown=node /app/out/swagger.json /app/out/swagger.json
COPY --from=build --chown=node /app/static /app/out/static

CMD ["sh", "/app/init_scripts/start.sh"]
