# ServiceGrid — production image (Vite static build served by nginx).
# Build:  docker build -t servicegrid .
# Run:    docker run -p 8080:80 servicegrid
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
