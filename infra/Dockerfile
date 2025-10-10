# syntax=docker/dockerfile:1

########################
# 1) Frontend build
########################

FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend

# install deps
COPY frontend/package*.json ./
RUN npm ci

# build
COPY frontend/ ./
RUN npm run build

########################
# 2) Backend build
########################
FROM node:22-alpine AS backend-build
WORKDIR /app/backend

# install deps
COPY backend/package*.json ./
RUN npm ci

# build TS
COPY backend/ ./
RUN npm run build

########################
# 3) Runtime
########################
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# install only production deps for the backend
COPY --from=backend-build /app/backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# copy backend build + assets
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/assets ./backend/assets

# copy the built frontend into backend/public (served by Express)
COPY --from=frontend-build /app/frontend/dist ./backend/public

# expose the backend port
EXPOSE 3000
WORKDIR /app/backend

# start the API (which also serves the frontend build)
CMD ["node", "dist/index.js"]
