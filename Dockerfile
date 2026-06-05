FROM node:22-slim

RUN apt-get update && apt-get install -y \
  git \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN npm install --production=false
RUN ls -la node_modules/@anthropic-ai/ || echo "ANTHROPIC NOT INSTALLED"
COPY server.js .

EXPOSE 3000
CMD ["node", "server.js"]