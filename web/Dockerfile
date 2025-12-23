FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the app
RUN npm run build

# Install a simple static server
RUN npm install -g serve

# Serve the dist folder on port 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
