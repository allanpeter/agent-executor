FROM node:22-slim

# Instala dependências do sistema
RUN apt-get update && apt-get install -y \
  git \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instala Claude Code globalmente
RUN npm install -g @anthropic-ai/claude-code

# Configura diretório de trabalho
WORKDIR /app

# Copia package.json e instala dependências
COPY package.json .
RUN npm install

# Copia servidor
COPY server.js .

# Expõe porta
EXPOSE 3000

CMD ["node", "server.js"]
