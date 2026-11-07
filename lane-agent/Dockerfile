FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY skills ./skills
RUN npm run build && npm prune --omit=dev
# config/org.yaml and data/ are mounted at runtime (one volume per deployment).
ENV DATA_DIR=/data ORG_CONFIG=/config/org.yaml
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
