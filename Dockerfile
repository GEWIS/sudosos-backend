# Build in a different image to keep the target image clean
FROM node:14-alpine as build
WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm install
COPY ./ ./
RUN npm run build \
 && npm run swagger

# The target image that will be run
FROM node:14-alpine as target
WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm install --production
COPY --from=build --chown=node /app/out/src /app/src
COPY --from=build --chown=node /app/out/swagger.json /app/out/swagger.json
CMD ["node", "src/index.js"]