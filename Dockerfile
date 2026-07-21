FROM node:20-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build


FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]