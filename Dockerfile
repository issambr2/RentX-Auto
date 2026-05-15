# Étape 1 : Construction de l'application
FROM node:22 AS build
WORKDIR /app

# Installation des outils de build pour native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# On réinstalle seulement les dépendances de production dans le build stage pour être sûr
RUN rm -rf node_modules && npm install --production

# Étape 2 : Serveur de production
FROM node:22-slim
WORKDIR /app

# Installation de curl pour les healthchecks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
# Copy firebase config if it exists
COPY --from=build /app/firebase-applet-config.jso[n] ./

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

# Démarrage avec node directement sur le fichier compilé (.cjs car c'est ce que produit esbuild)
CMD ["node", "dist/server.cjs"]
