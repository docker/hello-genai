FROM node:22-alpine AS build
WORKDIR /app
# Copy the lockfile too and use `npm ci`: installs exactly the pinned versions
# (reproducible builds) and fails loudly if the lockfile drifts from package.json,
# rather than silently resolving different versions than local.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
# Apply outstanding Alpine security patches to the runtime image
RUN apk upgrade --no-cache
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
