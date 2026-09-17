#!/bin/bash
# test-zeus-build-preview.sh - Standalone script for testing Zeus build and preview
# This script replicates the zeus-build-preview GitHub Action for local testing
#
# Usage:
#   # First run test-zeus-setup.sh to configure authentication
#   bash scripts/test-zeus-setup.sh
#   # Then run this script
#   bash scripts/test-zeus-build-preview.sh
#
# Or combine both in one go:
#   export ZEPP_APP_TOKEN="your_token"
#   export ZEPP_USER_ID="your_user_id"
#   export ZEPP_CNAME="your_cname"
#   bash scripts/test-zeus-setup.sh && bash scripts/test-zeus-build-preview.sh
#
# This script performs:
# 1. Builds the app using zeus build
# 2. Generates Zeus preview QR code (if authenticated)
# 3. Outputs the QR code as both ASCII art and PNG image

set -e

echo "================================================"
echo "Zeus Build and Preview Test Script"
echo "================================================"
echo ""

# Check if zeus is available
if ! command -v zeus &> /dev/null; then
  echo "❌ Zeus CLI is not installed or not in PATH"
  echo "Please run: bash scripts/test-zeus-setup.sh first"
  exit 1
fi

echo "Step 1: Building app with Zeus..."
echo "Running: zeus build"
echo ""

if zeus build; then
  echo ""
  echo "✅ Zeus build completed successfully"
else
  echo ""
  echo "❌ Zeus build failed"
  exit 1
fi

echo ""
echo "Step 2: Checking Zeus authentication status..."

# Check if Zeus is configured (by checking if config file exists and has credentials)
ZEUS_CONFIG_FILE="$HOME/.zeus_config"
if [ ! -f "$ZEUS_CONFIG_FILE" ]; then
  echo "⚠️  Zeus config file not found at $ZEUS_CONFIG_FILE"
  echo "⚠️  Authentication is not configured. Skipping preview QR code generation."
  echo "⚠️  To configure, run: bash scripts/test-zeus-setup.sh with credentials"
  echo ""
  echo "ZEUS_QR_GENERATED=false"
  exit 0
fi

echo "✅ Zeus config file found"
echo ""
echo "Step 3: Generating Zeus Preview QR Code..."
echo "Running: bash scripts/generate-zeus-preview.sh"
echo ""

# Run the Zeus preview script
if bash scripts/generate-zeus-preview.sh; then
  echo ""
  echo "✅ Zeus preview QR code generation completed"
  
  # Check if QR code was actually generated
  if [ -f "zeus_preview_qr.png" ]; then
    echo "✅ QR code image saved to zeus_preview_qr.png"
    echo "ZEUS_QR_GENERATED=true"
    echo ""
    echo "================================================"
    echo "SUCCESS: You can now use the zeus_preview_qr.png"
    echo "================================================"
    exit 0
  else
    echo "⚠️  QR code image not found (zeus_preview_qr.png)"
    echo "⚠️  The ASCII QR code was displayed but image generation failed"
    echo "ZEUS_QR_GENERATED=false"
    exit 0
  fi
else
  echo ""
  echo "⚠️  Zeus preview script encountered issues"
  echo "⚠️  Check the output above for details"
  echo "ZEUS_QR_GENERATED=false"
  exit 0
fi
