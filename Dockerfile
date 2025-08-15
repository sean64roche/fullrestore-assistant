ARG NODE_VERSION=23
FROM node:${NODE_VERSION}-alpine

ARG NPM_TOKEN
ARG CI_SERVER_HOST

WORKDIR /

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

WORKDIR /app/

RUN npm config set -- //gitlab.com/api/v4/projects/69690868/packages/npm/:_authToken="${NPM_TOKEN}"
RUN echo "@fullrestore:registry=https://${CI_SERVER_HOST}/api/v4/projects/69690868/packages/npm/" > .npmrc


COPY package.json ./
COPY package-lock.json ./
COPY src ./src

RUN npm install

WORKDIR /app/src/

RUN ["node", "deploy-commands.js"]

CMD ["node", "index.js"]
