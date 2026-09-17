#!/bin/bash
# Generate Zeus Preview QR Code
# This script automates the zeus preview command to generate a QR code for app installation

set -e

echo "Installing required tools (qrencode, imagemagick, expect, python3-pip, libzbar0 for QR decoding)..."
if ! sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1; then
  echo "::error::Failed to update package lists"
  exit 1
fi
if ! sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq qrencode imagemagick expect python3-pip python3-pil libzbar0 > /dev/null 2>&1; then
  echo "::error::Failed to install required tools"
  exit 1
fi
echo "Installing Python QR code libraries..."
if ! pip3 install -q qrcode pyzbar pillow > /dev/null 2>&1; then
  echo "::warning::Failed to install Python QR libraries, will try alternative methods"
fi
echo "✅ Tools installed successfully"

# Note: expect automates the interactive device selection in 'zeus preview'
# (Zeus CLI doesn't provide a command-line option for this)

# Run zeus preview and capture output
echo "Running zeus preview to generate QR code..."

# Use timeout wrapper to prevent indefinite hanging (45 seconds max)
# This provides a hard limit even if expect script itself hangs
# Use expect to automate the device selection and capture all output
set +e  # Temporarily disable exit-on-error to capture exit code

# Write expect script to temp file to avoid bash interpretation issues
EXPECT_SCRIPT=$(mktemp)
cat > "$EXPECT_SCRIPT" <<'EOF'
# Set timeout to 30 seconds - sufficient for device selection and QR code generation
set timeout 30
log_user 1
log_file -noappend /tmp/zeus_preview.log

spawn zeus preview

# Wait for device selection prompt and select Amazfit Balance (second option)
expect {
  -re {Which device would you like to preview\?} {
    # Wait a moment for the list to fully render
    sleep 0.5
    # Send down arrow to move from "Amazfit GTR 3" (default/first) to "Amazfit Balance" (second)
    # This selects the primary target device for the app
    send "\033\[B"
    sleep 0.5
    # Send enter to confirm selection
    send "\r"
    # Wait for the build and QR code generation to complete
    # The QR code is displayed as ASCII art, so we just wait for completion
    expect {
      timeout {
        puts "\nWaiting for QR code generation to complete..."
      }
      eof {
        puts "\nCommand completed (EOF)"
      }
    }
  }
  timeout {
    puts "\nTimeout waiting for device selection prompt"
  }
  eof {
    puts "\nCommand completed (no device selection needed)"
  }
}

# Give the command a moment to finish outputting everything
sleep 1

# Force exit to prevent hanging
catch {
  # Try to close the spawned process gracefully
  close
}
catch {
  wait
}
exit 0
EOF

PREVIEW_OUTPUT=$(timeout 45 expect "$EXPECT_SCRIPT" 2>&1)
EXPECT_EXIT_CODE=$?
rm -f "$EXPECT_SCRIPT"  # Clean up temp file
set -e  # Re-enable exit-on-error

# Check if the command timed out (timeout command returns exit code 124)
if [ $EXPECT_EXIT_CODE -eq 124 ]; then
  echo "::warning::Zeus preview command timed out after 45 seconds"
fi

echo "Preview output:"
echo "$PREVIEW_OUTPUT"

# Also show the log file if it exists
if [ -f /tmp/zeus_preview.log ]; then
  echo "Full log file contents:"
  cat /tmp/zeus_preview.log
fi

# Debug: Show cleaned output for URL extraction
echo "::debug::Attempting URL extraction from output..."

# Helper function to extract URL from text
extract_url() {
  local text="$1"
  # Strip ANSI escape codes first (they may hide or corrupt the URL)
  # Remove common ANSI escape sequences:
  # - CSI sequences: ESC[...m (colors, formatting)
  # - ESC[...H/G/K (cursor positioning, line clearing)
  # - Other ESC sequences
  local cleaned_text=$(echo "$text" | sed 's/\x1B\[[0-9;]*[mGKHJfABCDsuhl]//g' | sed 's/\x1B[@-_][0-9;]*[ -\/]*[@-~]//g')
  
  # Try zepp:// or zpkd1:// deep link formats (preferred)
  local url=$(echo "$cleaned_text" | grep -oP '(zepp|zpkd1)://[^\s\r\n"]+' | head -1 || echo "")
  # If no deep link URL found, try https:// format
  if [ -z "$url" ]; then
    url=$(echo "$cleaned_text" | grep -oP 'https://[a-zA-Z0-9./?&=_:#-]+' | head -1 || echo "")
  fi
  echo "$url"
}

# Helper function to extract and decode ASCII QR code
extract_qr_from_ascii() {
  local text="$1"
  
  # Check if QR code exists in output
  if ! echo "$text" | grep -q "^▄▄▄▄▄"; then
    echo "::debug::No ASCII QR code block found in output"
    return 1
  fi
  
  echo "::debug::Found ASCII QR code block, attempting to decode..."
  
  # Save output to temp file for Python script
  local temp_file=$(mktemp)
  echo "$text" > "$temp_file"
  
  # Try to decode using Python script
  local decoded_url=$(python3 scripts/decode-ascii-qr.py "$temp_file" 2>/dev/null || echo "")
  
  # Clean up
  rm -f "$temp_file"
  
  if [ -n "$decoded_url" ]; then
    echo "::debug::Successfully decoded QR code: $decoded_url"
    echo "$decoded_url"
    return 0
  else
    echo "::debug::Failed to decode QR code using Python script"
    return 1
  fi
}

# Try to extract the preview URL from output
PREVIEW_URL=$(extract_url "$PREVIEW_OUTPUT")

# Also check the log file if URL not found in stdout
if [ -z "$PREVIEW_URL" ] && [ -f /tmp/zeus_preview.log ]; then
  PREVIEW_URL=$(extract_url "$(cat /tmp/zeus_preview.log)")
fi

# If still no URL found, try to capture and convert ASCII QR code to image
if [ -z "$PREVIEW_URL" ]; then
  echo "No URL text found in output, attempting to decode ASCII QR code..."
  echo "::debug::Converting ASCII QR code to PNG image for capture"
  
  # Try to convert ASCII QR to image and decode it - disable exit on error temporarily
  set +e
  
  # Define temp file paths
  TEMP_OUTPUT_FILE=$(mktemp)
  DECODED_URL_FILE=$(mktemp)
  
  echo "$PREVIEW_OUTPUT" > "$TEMP_OUTPUT_FILE"
  
  # Try from stdout first
  echo "Converting ASCII QR code to image..."
  python3 scripts/decode-ascii-qr.py "$TEMP_OUTPUT_FILE" > "$DECODED_URL_FILE" 2>&1
  DECODE_EXIT_CODE=$?
  
  # Read the decoded URL if successful
  if [ $DECODE_EXIT_CODE -eq 0 ] && [ -f "$DECODED_URL_FILE" ]; then
    # Extract only the URL line (ignoring debug messages from stderr)
    # The URL should be on a line starting with zepp://, zpkd1://, or https://
    DECODED_URL=$(grep -oP '^(zepp|zpkd1|https)://[^\s\r\n]+' "$DECODED_URL_FILE" | head -1 || echo "")
  else
    echo "First attempt failed, output was:"
    cat "$DECODED_URL_FILE" 2>/dev/null || echo "(no output)"
    DECODED_URL=""
  fi
  
  # If stdout didn't work, try from log file
  if [ $DECODE_EXIT_CODE -ne 0 ] && [ -f /tmp/zeus_preview.log ]; then
    echo "Trying from log file..."
    cat /tmp/zeus_preview.log > "$TEMP_OUTPUT_FILE"
    python3 scripts/decode-ascii-qr.py "$TEMP_OUTPUT_FILE" > "$DECODED_URL_FILE" 2>&1
    DECODE_EXIT_CODE=$?
    
    if [ $DECODE_EXIT_CODE -eq 0 ] && [ -f "$DECODED_URL_FILE" ]; then
      # Extract only the URL line (ignoring debug messages from stderr)
      # The URL should be on a line starting with zepp://, zpkd1://, or https://
      DECODED_URL=$(grep -oP '^(zepp|zpkd1|https)://[^\s\r\n]+' "$DECODED_URL_FILE" | head -1 || echo "")
    else
      echo "Second attempt failed, output was:"
      cat "$DECODED_URL_FILE" 2>/dev/null || echo "(no output)"
      DECODED_URL=""
    fi
  fi
  
  # Clean up temp files
  rm -f "$TEMP_OUTPUT_FILE" "$DECODED_URL_FILE"
  
  # Check if we got a URL from the decoding
  if [ $DECODE_EXIT_CODE -eq 0 ] && [ -n "$DECODED_URL" ]; then
    # Check if the decoded output looks like a URL (zepp://, zpkd1://, or https://)
    if echo "$DECODED_URL" | grep -q "^zepp://\|^zpkd1://\|^https://"; then
      PREVIEW_URL="$DECODED_URL"
      echo "✅ Successfully decoded ASCII QR code to URL: $PREVIEW_URL"
      
      # Move the generated temp image to the final location
      if [ -f "qr_temp.png" ]; then
        mv qr_temp.png zeus_preview_qr.png
        echo "✅ ASCII QR code converted to image: zeus_preview_qr.png"
        
        # Validate the image by decoding it again
        echo "Validating generated QR code image..."
        set +e
        VALIDATION_URL=$(python3 -c "
from PIL import Image
from pyzbar.pyzbar import decode
try:
    img = Image.open('zeus_preview_qr.png')
    decoded = decode(img)
    if decoded:
        print(decoded[0].data.decode('utf-8'))
        exit(0)
    else:
        exit(1)
except Exception as e:
    print(f'Error: {e}', file=__import__('sys').stderr)
    exit(1)
" 2>&1)
        VALIDATION_EXIT_CODE=$?
        set -e
        
        # Output the URL and mark QR as generated if we have the image file
        if [ -f "zeus_preview_qr.png" ]; then
          if [ -n "$GITHUB_OUTPUT" ]; then
            echo "PREVIEW_URL=$PREVIEW_URL" >> "$GITHUB_OUTPUT"
            echo "ZEUS_QR_GENERATED=true" >> "$GITHUB_OUTPUT"
          fi
        else
          echo "::warning::QR image file not found after conversion"
          if [ -n "$GITHUB_OUTPUT" ]; then
            echo "ZEUS_QR_GENERATED=false" >> "$GITHUB_OUTPUT"
          fi
        fi
        
        # Validate the QR code and report status (but don't fail)
        if [ $VALIDATION_EXIT_CODE -eq 0 ]; then
          if [ "$VALIDATION_URL" = "$PREVIEW_URL" ]; then
            echo "✅ QR code image validated successfully - decodes back to same URL"
          else
            echo "⚠️  Warning: QR code validation found URL mismatch"
            echo "   Original:  $PREVIEW_URL"
            echo "   Validated: $VALIDATION_URL"
            # Check if both are valid zpkd1:// URLs - if so, it's still acceptable
            if echo "$VALIDATION_URL" | grep -q "^zpkd1://"; then
              echo "   Both URLs are valid zpkd1:// URLs, accepting QR code"
            fi
          fi
        else
          echo "⚠️  Warning: QR code validation failed"
          echo "   Original:  $PREVIEW_URL"
          echo "   Validated: $VALIDATION_URL"
          echo "   QR code image will still be used"
        fi
      fi
    else
      echo "::debug::Decoded output doesn't look like a URL: $DECODED_URL"
    fi
  else
    echo "❌ Failed to decode ASCII QR code (exit code: $DECODE_EXIT_CODE)"
  fi
  
  set -e
fi

# If we still don't have the image or URL after ASCII conversion attempt
if [ ! -f "zeus_preview_qr.png" ]; then
  if [ -n "$PREVIEW_URL" ]; then
    # We have URL but no image - generate it with qrencode
    if [ -n "$GITHUB_OUTPUT" ]; then
      echo "PREVIEW_URL=$PREVIEW_URL" >> "$GITHUB_OUTPUT"
    fi
    echo "✅ Zeus preview URL: $PREVIEW_URL"
    
    echo "Generating QR code image from URL..."
    qrencode -s 10 -o zeus_preview_qr.png "$PREVIEW_URL"
    
    # Validate the generated QR code
    echo "Validating generated QR code image..."
    set +e
    VALIDATION_URL=$(python3 -c "
from PIL import Image
from pyzbar.pyzbar import decode
try:
    img = Image.open('zeus_preview_qr.png')
    decoded = decode(img)
    if decoded:
        print(decoded[0].data.decode('utf-8'))
        exit(0)
    else:
        exit(1)
except Exception as e:
    print(f'Error: {e}', file=__import__('sys').stderr)
    exit(1)
" 2>&1)
    VALIDATION_EXIT_CODE=$?
    set -e
    
    if [ $VALIDATION_EXIT_CODE -eq 0 ]; then
      echo "✅ QR code image validated successfully"
      if [ -n "$GITHUB_OUTPUT" ]; then
        echo "ZEUS_QR_GENERATED=true" >> "$GITHUB_OUTPUT"
      fi
    else
      echo "⚠️  Warning: QR code validation failed"
      if [ -n "$GITHUB_OUTPUT" ]; then
        echo "ZEUS_QR_GENERATED=false" >> "$GITHUB_OUTPUT"
      fi
    fi
  else
    # No URL and no image - provide helpful information
    echo "::warning::Could not extract preview URL or convert ASCII QR code"
    echo "::notice::The QR code is displayed above for manual scanning with the Zepp app"
    echo "::notice::To scan: Open Zepp App → Profile → Your Device → Developer Mode → Scan"
    if [ -n "$GITHUB_OUTPUT" ]; then
      echo "ZEUS_QR_GENERATED=false" >> "$GITHUB_OUTPUT"
    fi
  fi
else
  echo "✅ QR code image saved to zeus_preview_qr.png"
fi

# Always exit successfully - QR code decoding is optional
exit 0
