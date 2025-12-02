# Stage 1: Build the Angular app
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build --configuration=production

# Stage 2: Serve with Nginx
FROM nginx:alpine
# Kopieer de gebouwde bestanden van de 'build' stage naar de html folder van nginx
COPY --from=build /app/dist/jouw-project-naam /usr/share/nginx/html
# Kopieer eventueel een custom nginx config
# COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

#### 2. Nginx Configuratie
De standaard Nginx config werkt prima, maar voor een Single Page App (SPA) moet je ervoor zorgen dat alle routes naar `index.html` verwijzen (anders krijg je 404 fouten als je de pagina ververst).

Maak een bestand `nginx.conf`:
```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

#### 3. Waarom Angular in dit geval?
* **Structuur:** De code hierboven gebruikt TypeScript interfaces (`Transaction`, `MonthlySummary`). Dit voorkomt fouten (bijv. per ongeluk tekst in een bedragveld stoppen).
* **Signals:** Ik heb de nieuwste Angular "Signals" gebruikt (`computed`, `effect`). Dit maakt de app razendsnel; als je een transactie toevoegt, wordt de hele matrix en alle totalen direct opnieuw berekend zonder vertraging.
* **Toekomst:** Als je later MongoDB koppelt, hoef je alleen de `loadFromStorage` en `saveTransaction` methodes te vervangen door HTTP calls naar je API. De rest van de interface blijft exact hetzelfde.
