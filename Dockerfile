ARG NODE_VERSION=23
FROM node:${NODE_VERSION}-alpine

ARG NPM_TOKEN
ARG CI_SERVER_HOST

WORKDIR /

RUN npm config set -- //gitlab.com/api/v4/projects/69690868/packages/npm/:_authToken="${NPM_TOKEN}"
RUN echo "@fullrestore:registry=https://${CI_SERVER_HOST}/api/v4/projects/69690868/packages/npm/" > .npmrc

WORKDIR /app/

COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm ci

RUN npm config delete //gitlab.com/api/v4/projects/69690868/packages/npm/:_authToken
RUN rm -f .npmrc

WORKDIR /app/src/

CMD ["npx", "tsx", "src/deploy-commands.ts"]

CMD ["npx", "tsx", "src/index.ts"]
