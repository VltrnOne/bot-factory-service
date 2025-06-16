# Use a specific Node.js version for stability
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies using 'npm ci' for faster, more reliable builds
RUN npm ci --only=production

# --- THIS IS THE FIX ---
# Copy the config directory containing your schemas
COPY config ./config

# Copy the application source code
COPY src ./src

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run your app
CMD [ "npm", "start" ]
