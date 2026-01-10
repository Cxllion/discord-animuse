#!/bin/bash
# Font installation script for Render deployment
# Installs premium fonts for beautiful text rendering

echo "🎨 Installing premium fonts for graphics..."

# Update package lists
apt-get update -y

# Install premium font packages
apt-get install -y \
  fonts-noto \
  fonts-noto-color-emoji \
  fonts-roboto \
  fonts-ubuntu \
  fonts-liberation \
  fonts-dejavu-core \
  fontconfig

# Refresh font cache
fc-cache -f -v

echo "✅ Fonts installed successfully!"
echo ""
echo "📋 Available premium fonts:"
fc-list | grep -iE "roboto|ubuntu|noto|liberation" | head -20

echo ""
echo "🎯 Graphics will now render with:"
echo "   - Roboto (Modern, Google default)"
echo "   - Ubuntu (Clean, readable)"
echo "   - Noto Sans (Universal coverage)"
echo "   - Liberation (Microsoft font alternative)"
