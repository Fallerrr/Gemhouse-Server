# Use Node.js base image
FROM node:22

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy runtime code explicitly so deploy ignores cannot accidentally drop the entrypoint
COPY index.js DefaultRoute.js ./
COPY handlers ./handlers
COPY services ./services
RUN test -f /app/index.js

# Expose the WebSocket listener port
EXPOSE 3000

# Start your server
CMD ["node", "index.js"]
