FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_1AM_NETWORK=preview
ARG VITE_ZK_MINT_ASSET_BASE_PATH=/zk/shieldedMint

ENV VITE_1AM_NETWORK=$VITE_1AM_NETWORK
ENV VITE_ZK_MINT_ASSET_BASE_PATH=$VITE_ZK_MINT_ASSET_BASE_PATH

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
