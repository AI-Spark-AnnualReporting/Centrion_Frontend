FROM node:20-alpine

WORKDIR /app

# Install dependencies. --include=dev because vite lives in devDependencies and
# npm ci drops those whenever NODE_ENV=production, which most build platforms set.
COPY package*.json ./
RUN npm ci --include=dev

# Copy frontend source
COPY . .

# Vite dev server
EXPOSE 8080

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]