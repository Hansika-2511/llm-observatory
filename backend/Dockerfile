FROM node:20-alpine

RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY src ./src

EXPOSE 4000

CMD ["node", "src/index.js"]
