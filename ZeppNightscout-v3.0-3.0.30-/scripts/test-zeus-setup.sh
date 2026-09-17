#!/bin/bash
# test-zeus-setup.sh - Standalone script for testing Zeus CLI setup
# This script replicates the zeus-setup GitHub Action for local testing
#
# Usage:
#   export ZEPP_APP_TOKEN="your_token"
#   export ZEPP_USER_ID="your_user_id"
#   export ZEPP_CNAME="your_cname"
#   bash scripts/test-zeus-setup.sh
#
# This script performs:
# 1. Installs Zeus CLI globally via npm
# 2. Configures Zeus CLI authentication tokens
# 3. Outputs success/failure status

set -e

echo "================================================"
echo "Zeus CLI Setup Test Script"
echo "================================================"
echo ""

# Check if authentication tokens are available
if [ -z "$ZEPP_APP_TOKEN" ] || [ -z "$ZEPP_USER_ID" ] || [ -z "$ZEPP_CNAME" ]; then
  echo "⚠️  WARNING: ZEPP_APP_TOKEN, ZEPP_USER_ID, or ZEPP_CNAME not set."
  echo "⚠️  Skipping Zeus authentication."
  echo "⚠️  Zeus preview QR code will not be generated."
  echo ""
  echo "To run with authentication, set these environment variables:"
  echo "  export ZEPP_APP_TOKEN=\"your_token\""
  echo "  export ZEPP_USER_ID=\"your_user_id\""
  echo "  export ZEPP_CNAME=\"your_cname\""
  echo ""
  echo "ZEUS_LOGIN_SUCCESS=false"
  exit 0
fi

# Install Zeus CLI
echo "Step 1: Installing Zeus CLI..."
echo "Running: npm install -g @zeppos/zeus-cli"
echo ""

if npm install -g @zeppos/zeus-cli; then
  echo "✅ Zeus CLI installed successfully"
else
  echo "❌ Failed to install Zeus CLI"
  exit 1
fi

echo ""
echo "Step 2: Configuring Zeus CLI authentication..."
echo "Running: zeus config set ____user_zepp_com__token=*** ____user_zepp_com__userid=*** ____user_zepp_com__cname=***"
echo ""

# Configure Zeus CLI with authentication tokens using zeus config set
# Verified: zeus config set supports multiple key=value pairs in a single command
if zeus config set \
  "____user_zepp_com__token=$ZEPP_APP_TOKEN" \
  "____user_zepp_com__userid=$ZEPP_USER_ID" \
  "____user_zepp_com__cname=$ZEPP_CNAME"; then
  echo ""
  echo "✅ Successfully configured Zeus CLI authentication"
  echo "ZEUS_LOGIN_SUCCESS=true"
  exit 0
else
  echo ""
  echo "❌ Zeus authentication configuration failed."
  echo "⚠️  Preview QR code will not be generated."
  echo "ZEUS_LOGIN_SUCCESS=false"
  exit 1
fi
