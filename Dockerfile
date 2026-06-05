FROM node:22-slim

RUN apt-get update && apt-get install -y \
  git \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN npm install --production=false --verbose 2>&1 | tail -20
RUN ls /app/node_modules/@anthropic-ai/ || echo "FALHOU: anthropic-ai nao instalado"
COPY server.js .

EXPOSE 3000
CMD ["node", "server.js"]