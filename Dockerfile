# Bygges fra repo-roten (ikke fra server/) fordi public/ (admin + elevapp)
# ligger ved siden av server/, ikke inni den — server/src/config.js forventer
# «../../public» relativt til server/src.
FROM node:20-slim

WORKDIR /app

# Kun det som trengs for npm ci først, så Docker kan cache dette laget
# uavhengig av resten av kildekoden.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Resten av repoet (public/ trengs av server/src/config.js, se over).
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/src/index.js"]
