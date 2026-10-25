# ── 构建阶段 ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY vendor ./vendor
# 国内服务器直连 npmjs 不稳，默认走 npmmirror（lockfile 里的 registry.npmjs.org
# 会被 npm 默认的 replace-registry-host 自动改写）；海外机用 --build-arg 覆盖
ARG NPM_REGISTRY=https://registry.npmmirror.com
# fetch-retries：服务器出网间歇抖动，单次 ETIMEDOUT 不该让整个构建失败
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 10000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci --registry=${NPM_REGISTRY}
COPY . .
RUN npm run build

# ── 运行阶段：Nginx 托管静态页 ──
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
