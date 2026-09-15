# Image de production pour le backend GEM Market.
# Build en une étape "build" (compile le TypeScript, génère le client Prisma,
# installe toutes les dépendances) puis on ne recopie que le nécessaire dans
# une image finale allégée — sans jamais relancer `npm install` dans l'image
# finale (ça évite de redéclencher inutilement les scripts d'installation).

FROM node:20-slim AS build
WORKDIR /app

# node:20-slim n'a pas le binaire `openssl`, dont Prisma se sert pour détecter
# la version de libssl et choisir le bon moteur natif. Sans lui, Prisma devine
# (mal) "openssl-1.1.x" et télécharge/utilise un moteur incompatible avec la
# libssl 3.x de Debian bookworm — le moteur plante alors silencieusement.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
# npm install (pas npm ci) : le lockfile committé peut être en retard d'une
# dépendance par rapport à package.json (ex. ajout de bcryptjs) — npm install
# réconcilie les deux au lieu d'exiger une correspondance stricte.
RUN npm install

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Même raison qu'à l'étape "build" : nécessaire pour que `prisma db push` (CMD
# ci-dessous) détecte correctement libssl et charge le bon moteur natif.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./

EXPOSE 3000
# Applique le schéma Prisma courant à la base au démarrage (le projet utilise
# `prisma db push`, pas de migrations trackées — voir prisma/schema.prisma).
# Idempotent : ne fait rien si le schéma est déjà à jour.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/src/main.js"]
