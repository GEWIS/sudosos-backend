# Build in a different image to keep the target image clean
FROM node:16-alpine as build
WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm install
COPY ./ ./
RUN npm run build \
 && npm run swagger

# The target image that will be run
FROM node:16-alpine as target

RUN apk add openssl

WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm install --production
ARG TYPEORM_USERNAME
ARG TYPEORM_PASSWORD
ARG TYPEORM_DATABASE

COPY --from=build --chown=node /app/init_scripts /app/init_scripts
RUN chmod +x /app/init_scripts/start.sh

COPY --from=build --chown=node /app/out/src /app/out/src
COPY --from=build --chown=node /app/out/swagger.json /app/out/swagger.json

RUN apk add --no-cache python3 py3-pip mysql-client mariadb-connector-c
RUN pip install python-dotenv mysql-connector-python==8.0.29 --quiet
RUN (crontab -l && echo "41 2 * * * sh -c 'python3 /app/init_scripts/susos.py | mysql -h container.mysql.gewis.nl -u $TYPEORM_USERNAME -p$TYPEORM_PASSWORD $TYPEORM_DATABASE'") | crontab -
RUN /usr/sbin/crond

CMD ["sh", "/app/init_scripts/start.sh"]
