FROM node:22-slim

RUN apt-get update && apt-get install -y \
  git \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Cria usuário não-root
RUN useradd -m -u 1001 agent
WORKDIR /app
RUN chown agent:agent /app

COPY package.json .
RUN npm install --production=false
RUN chown -R agent:agent /app

COPY server.js .

# Garante que /tmp é acessível
RUN mkdir -p /tmp && chmod 1777 /tmp

USER agent

EXPOSE 3000
CMD ["node", "server.js"]