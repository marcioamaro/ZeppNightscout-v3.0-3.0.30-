#!/bin/bash
# Generate release notes for ZeppNightscout
# Usage: generate-release-notes.sh VERSION BASE_VERSION BUILD_NUMBER TAG BRANCH ARTIFACT_NAME DOWNLOAD_URL QR_URL ZEUS_QR_GENERATED [QR_IMAGE_URL] [ZEUS_PREVIEW_URL]
# Parameters:
#   1-9: Required parameters
#   10: QR_IMAGE_URL - Optional, URL to the Zeus QR code image in the release
#   11: ZEUS_PREVIEW_URL - Optional, the decoded Zeus preview URL (zpkd1://...)

set -e

VERSION="$1"
BASE_VERSION="$2"
BUILD_NUMBER="$3"
TAG="$4"
BRANCH="$5"
ARTIFACT_NAME="$6"
DOWNLOAD_URL="$7"
QR_URL="$8"
ZEUS_QR_GENERATED="$9"
QR_IMAGE_URL="${10}"
ZEUS_PREVIEW_URL="${11}"

# Check if release_notes.md already exists and create backup
if [ -f release_notes.md ]; then
  echo "::warning::release_notes.md already exists, creating backup"
  cp release_notes.md release_notes.md.backup
fi

cat > release_notes.md << EOF
## ZeppNightscout ${VERSION}

**Released**: $(date -u '+%Y-%m-%d %H:%M:%S UTC')

**Build**: #${BUILD_NUMBER} | **Base Version**: ${BASE_VERSION} | **Branch**: ${BRANCH}

### Download

Download the app: [${ARTIFACT_NAME}](${DOWNLOAD_URL})

EOF

# Add Zeus Preview QR Code section if available
if [ "$ZEUS_QR_GENERATED" == "true" ]; then
  cat >> release_notes.md << EOF
### 🚀 Quick Install via Zepp App (Recommended)

**Scan this QR code with the Zepp App on your phone to install directly to your watch:**

![Zeus Preview QR Code](${QR_IMAGE_URL})

EOF
  
  # Add the decoded URL if available
  if [ -n "$ZEUS_PREVIEW_URL" ]; then
    cat >> release_notes.md << EOF
**Zeus Preview Link:** \`${ZEUS_PREVIEW_URL}\`

EOF
  fi
  
  cat >> release_notes.md << 'EOF'
> **Note:** This QR code connects directly to the Zepp platform for instant installation via the Zepp App's Developer Mode.
> Make sure Developer Mode is enabled in your Zepp App (Profile → Settings → About → tap Zepp icon 7 times).

EOF
else
  cat >> release_notes.md << 'EOF'
### ⚠️ Zeus Preview QR Code Not Available

> **Note:** The Zeus Preview QR code for direct installation is not included in this release.
> This typically occurs when Zeus authentication tokens are not configured or when the preview generation failed.
> Please use one of the alternative installation methods below.

EOF
fi

cat >> release_notes.md << EOF
### Alternative: Download QR Code

Scan this QR code with your phone to download the \`.zab\` file:

![Download QR Code](${QR_URL})

### Installation Instructions

EOF

# Conditional installation instructions based on Zeus QR availability
if [ "$ZEUS_QR_GENERATED" == "true" ]; then
  cat >> release_notes.md << 'EOF'
1. **Option 1 - Zeus Preview QR Code (Fastest)** ⭐
   - Enable Developer Mode in Zepp App (Profile → Settings → About → tap Zepp icon 7 times)
   - Open Zepp App → Profile → Your Device → Developer Mode
   - Tap "Scan" and scan the Zeus Preview QR code above
   - App installs directly to your watch!

2. **Option 2 - Download QR Code**
   - Scan the Download QR code above with your phone
   - Download the `.zab` file
   - Use the Zepp app to install it on your watch

3. **Option 3 - Direct Download**
   - Click the download link above
   - Transfer the `.zab` file to your phone
   - Use the Zepp app to install it on your watch

4. **Option 4 - Zeus CLI**
   - Download the release artifact
   - Use `zeus preview` or `zeus install` commands

EOF
else
  cat >> release_notes.md << 'EOF'
1. **Option 1 - Download QR Code** ⭐
   - Scan the Download QR code above with your phone
   - Download the `.zab` file
   - Use the Zepp app to install it on your watch

2. **Option 2 - Direct Download**
   - Click the download link above
   - Transfer the `.zab` file to your phone
   - Use the Zepp app to install it on your watch

3. **Option 3 - Zeus CLI**
   - Download the release artifact
   - Use `zeus preview` or `zeus install` commands

EOF
fi

cat >> release_notes.md << EOF
### What's Included

- App version: ${VERSION}
- Build number: ${BUILD_NUMBER}
- Compatible with Zepp OS devices
- Built from commit: ${GITHUB_SHA}

### Support

For issues and questions, please visit the [GitHub repository](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}).
EOF

cat release_notes.md
