# STAGE 1: Build de Angular applicatie
FROM node:18-alpine AS build
WORKDIR /app

# Kopieer package.json en installeer afhankelijkheden
COPY package*.json ./
# Gebruik --legacy-peer-deps om eventuele peer dependency waarschuwingen te negeren in Alpine
RUN npm install --legacy-peer-deps

# Kopieer de rest van de code en voer de build uit
COPY . .
# Voer de standaard Angular productiel build uit.
# De output map wordt automatisch bepaald door angular.json.
RUN npm run build --configuration=production

# STAGE 2: Serveer met Nginx
FROM nginx:alpine
# Kopieer de custom Nginx configuratie
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Kopieer de gebouwde statische bestanden van stage 1 naar de Nginx webroot
# LET OP: Controleer of 'personal-finance-tracker' de juiste projectnaam is.
COPY --from=build /app/dist/personal-finance-tracker/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
