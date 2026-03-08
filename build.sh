#!/bin/bash

# Download yt-dlp binary
mkdir -p bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp

# Ensure streams directory exists
mkdir -p streams
mkdir -p static

# Build the frontend (if using React)
# npm run build
# cp -r dist/* static/
