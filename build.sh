#!/bin/bash

# Install Python dependencies (if any)
# pip install -r requirements.txt

# Download yt-dlp binary
mkdir -p bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp

# Ensure streams directory exists
mkdir -p streams

# Build the frontend
npm run build
