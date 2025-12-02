# STAGE 1: Build de Angular applicatie
FROM node:18-alpine as build
WORKDIR /app

# Kopieer package.json en installeer afhankelijkheden
COPY package*.json ./
RUN npm install

# Kopieer de rest van de code en voer de build uit
COPY . .
# Let op: Vervang 'personal-finance-tracker' met de daadwerkelijke naam
# die Angular CLI gebruikt voor de output map (vaak hetzelfde als de projectnaam)
RUN npm run build --output-path=./dist/app

# STAGE 2: Serveer met Nginx
FROM nginx:alpine
# Kopieer de custom Nginx configuratie
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Kopieer de gebouwde statische bestanden van stage 1 naar de Nginx webroot
COPY --from=build /app/dist/app /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
