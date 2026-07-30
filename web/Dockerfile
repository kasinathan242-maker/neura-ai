# Two-stage build: compile the SPA, then serve it behind nginx with /api proxied
# to the backend container. The proxy is what lets the built app keep using the
# same relative `/api` path it uses on Vercel.
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
