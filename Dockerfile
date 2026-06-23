# Node 20 (tem fetch nativo — sem dep de http client).
FROM node:20-alpine

WORKDIR /app

# Instala só deps de produção (cache de layer).
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
