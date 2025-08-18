ARG NODE_VERSION=23
FROM node:${NODE_VERSION}-alpine

ARG NPM_TOKEN
ARG CI_SERVER_HOST=gitlab.com

WORKDIR /app/


COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./
COPY src ./src

RUN echo "@fullrestore:registry=https://${CI_SERVER_HOST}/api/v4/projects/69690868/packages/npm/" > .npmrc && \
    echo "//${CI_SERVER_HOST}/api/v4/projects/69690868/packages/npm/:_authToken=${NPM_TOKEN}" >> .npmrc

RUN npm install

RUN npm config delete //gitlab.com/api/v4/projects/69690868/packages/npm/:_authToken
RUN rm -f .npmrc

CMD ["sh", "-c", "npx tsx src/deploy-commands.ts && npx tsx src/index.ts"]
