FROM node:22-alpine AS build

ARG DARKPIX_RELEASE=dev
ENV VITE_DARKPIX_VERSION=$DARKPIX_RELEASE

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:stable-alpine

ARG DARKPIX_RELEASE=dev

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
RUN printf '%s\n' "$DARKPIX_RELEASE" > /usr/share/nginx/html/version.txt && chown nginx:nginx /usr/share/nginx/html/version.txt

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz >/dev/null || exit 1

ENTRYPOINT ["nginx", "-g", "daemon off;"]
