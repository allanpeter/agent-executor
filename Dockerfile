FROM node:22-slim

RUN apt-get update && apt-get install -y \
  git \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

# Descobre e salva o path do claude em variável de ambiente
RUN echo "CLAUDE_PATH=$(npm root -g)/@anthropic-ai/claude-code/cli.js" >> /etc/environment

WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .

EXPOSE 3000
CMD ["node", "server.js"]