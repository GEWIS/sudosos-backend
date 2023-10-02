# Build in a different image to keep the target image clean
FROM node:18-alpine as build
WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm install
COPY ./ ./
RUN npm run build \
 && npm run swagger

# The target image that will be run
FROM node:18-alpine as target

RUN apk add openssl

WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm ci
RUN npm install pm2 pm2-intercom -g
ARG TYPEORM_USERNAME
ARG TYPEORM_PASSWORD
ARG TYPEORM_DATABASE

COPY --from=build --chown=node /app/init_scripts /app/init_scripts
COPY --from=build --chown=node /app/pm2.json /app/pm2.json
RUN chmod +x /app/init_scripts/start.sh

COPY --from=build --chown=node /app/out/src /app/out/src
COPY --from=build --chown=node /app/out/swagger.json /app/out/swagger.json

CMD ["sh", "/app/init_scripts/start.sh"]
