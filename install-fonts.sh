#!/bin/bash
# Font installation script for Render deployment
# Installs high-quality fonts for canvas text rendering

echo "Installing fonts for text rendering..."

# Update package lists
apt-get update -y

# Install font packages
apt-get install -y \
  fonts-noto \
  fonts-noto-color-emoji \
  fontconfig

# Refresh font cache
fc-cache -f -v

echo "Fonts installed successfully!"
echo "Available fonts:"
fc-list | grep -i "noto"
