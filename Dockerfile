FROM node:22-slim

RUN apt-get update && apt-get install -y \
  git \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instala Claude Code e verifica
RUN npm install -g @anthropic-ai/claude-code && \
    npm list -g @anthropic-ai/claude-code && \
    npx claude --version

WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .

EXPOSE 3000
CMD ["node", "server.js"]