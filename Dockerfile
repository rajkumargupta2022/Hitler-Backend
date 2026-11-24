FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# Cloud Run sets PORT (8080); the app reads process.env.PORT
EXPOSE 8080
CMD ["node", "src/server.js"]
