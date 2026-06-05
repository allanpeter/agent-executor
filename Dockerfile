FROM node:22-slim

RUN apt-get update && apt-get install -y \
  git \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code
ENV PATH="/usr/local/lib/node_modules/.bin:$PATH"

WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .

EXPOSE 3000
CMD ["node", "server.js"]