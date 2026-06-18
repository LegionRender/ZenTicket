# Stage 1: Build the client assets and compile the server bundle
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Run the build script
# This produces the Vite static production client and the esbuild compiled commonjs server in the 'dist' directory
RUN npm run build

# Stage 2: Create a minimal production runner image
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package configurations
COPY package*.json ./

# Install only production dependencies (this excludes devDependencies to keep the image lightweight)
RUN npm ci --only=production

# Copy compiled files from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the standard container entry port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
