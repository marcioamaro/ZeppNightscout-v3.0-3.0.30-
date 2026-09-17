#!/bin/bash
# Test script to verify QR code image validation works

set -e

echo "=== Testing QR Code Image Validation ==="
echo ""

# Create a test URL
TEST_URL="zepp://applet/preview?appId=12345&token=test123"

echo "1. Generating test QR code with qrencode..."
qrencode -s 10 -o test_qr.png "$TEST_URL"
echo "   ✅ QR code image created: test_qr.png"
echo ""

echo "2. Validating QR code can be decoded back..."
DECODED_URL=$(python3 -c "
from PIL import Image
from pyzbar.pyzbar import decode
import sys

try:
    img = Image.open('test_qr.png')
    decoded = decode(img)
    if decoded:
        url = decoded[0].data.decode('utf-8')
        print(url)
        sys.exit(0)
    else:
        print('No QR code found in image', file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f'Error decoding: {e}', file=sys.stderr)
    sys.exit(1)
")

if [ $? -eq 0 ]; then
    echo "   ✅ Successfully decoded: $DECODED_URL"
    echo ""
    
    if [ "$DECODED_URL" = "$TEST_URL" ]; then
        echo "3. Validation PASSED ✅"
        echo "   Original URL:  $TEST_URL"
        echo "   Decoded URL:   $DECODED_URL"
        echo "   Status: URLs match!"
    else
        echo "3. Validation FAILED ❌"
        echo "   Original URL:  $TEST_URL"
        echo "   Decoded URL:   $DECODED_URL"
        echo "   Status: URLs don't match"
        exit 1
    fi
else
    echo "   ❌ Failed to decode QR code"
    exit 1
fi

# Cleanup
rm -f test_qr.png
echo ""
echo "=== Test completed successfully ==="
