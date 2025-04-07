FROM node:22-bookworm AS builder

WORKDIR /app

# Copy just package.json and package-lock.json
# to speed up the build using Docker layer cache.
COPY package*.json ./

# Install all dependencies. Don't audit to speed up the installation.
RUN npm ci

# Copy the source files.
COPY . ./

# Install all dependencies and build the project.
RUN npm run build

# Install Playwright and Firefox.
RUN npx -y playwright install --with-deps firefox

# Move the installed browser to a separate directory.
RUN mkdir -p /app/ms-playwright \
    && mv $(find ~/.cache/ms-playwright -type d -name "firefox" -path "*/firefox" | head -n 1) /app/ms-playwright/firefox

# Move Firefox libs to a separate directory for later copy.
RUN apt-get -y install strace && \
    mkdir -p /firefox/lib/ && \
    strace -e openat /app/ms-playwright/firefox/firefox 2>&1 | grep /lib/x86 | awk -F'"' '{print $2}' | xargs -I {} cp {} /firefox/lib/

# Create final image
FROM gcr.io/distroless/nodejs22-debian12

WORKDIR /app

# Copy the node_modules and built app from the build stage
COPY --from=builder /app /app

# Copy Firefox libs
COPY --from=builder /firefox/lib/* /lib/x86_64-linux-gnu/

# Set the default browser path to the installed Firefox.
ENV APIFY_DEFAULT_BROWSER_PATH=/app/ms-playwright/firefox/firefox

# Run the image.
CMD ["/app/dist/src/main.js", "--silent"]
