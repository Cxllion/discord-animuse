#!/bin/bash

echo "======================================"
echo "🎭 Animuse System Setup Initialization"
echo "======================================"
echo ""
echo "Updating package lists..."
sudo apt update

echo "Installing curl and git..."
sudo apt install -y curl git

echo "Installing Node.js v20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "Installing NPM dependencies for Animuse..."
npm install
npm install zod

echo ""
echo "======================================"
echo "✅ Setup Complete!"
echo "======================================"
