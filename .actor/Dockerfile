FROM node:22-bookworm AS builder

WORKDIR /app

# Copy just package.json and package-lock.json
# to speed up the build using Docker layer cache.
COPY package*.json ./

# Install all dependencies. Don't audit to speed up the installation.
RUN npm ci
RUN npx -y playwright install --with-deps firefox

# Next, copy the source files.
COPY . ./

# Install all dependencies and build the project.
# Don't audit to speed up the installation.
RUN npm run build

# Create final image
FROM gcr.io/distroless/nodejs22-debian12

WORKDIR /app

# Copy the node_modules and built app from the build stage
COPY --from=builder /app /app

# Run the image.
CMD ["/app/dist/src/main.js", "--silent"]
