# Étape 1 : Construction de l'application
FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Étape 2 : Serveur de production
FROM node:22-slim
WORKDIR /app

# Installation de curl pour les healthchecks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
# Copy firebase config if it exists
COPY --from=build /app/firebase-applet-config.jso[n] ./

# Installation des dépendances de production uniquement
RUN npm install --production

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

# Démarrage avec node directement sur le fichier compilé
CMD ["node", "dist/server.js"]
