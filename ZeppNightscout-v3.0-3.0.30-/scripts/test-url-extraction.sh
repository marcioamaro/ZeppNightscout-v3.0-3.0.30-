#!/bin/bash
# Test script to verify URL extraction from mixed output
# This tests the fix for the GITHUB_OUTPUT formatting issue

set -e

echo "Testing URL extraction from mixed output..."
echo ""

# Create a temp file with mixed output (URL + debug messages)
TEMP_FILE=$(mktemp)

# Test case 1: URL with debug messages (the problematic case)
cat > "$TEMP_FILE" <<'EOF'
Found QR code with 19 lines
Converted to image: qr_temp.png
zpkd1://api-mifit-de2.zepp.com/custom/tools/app-dial/download/1JVjqGQu1eiCTy4WUepxvjGIRBaeqMw
EOF

echo "Test 1: Extracting URL from mixed output..."
EXTRACTED_URL=$(grep -oP '^(zepp|zpkd1|https)://[^\s\r\n]+' "$TEMP_FILE" | head -1 || echo "")

if [ "$EXTRACTED_URL" = "zpkd1://api-mifit-de2.zepp.com/custom/tools/app-dial/download/1JVjqGQu1eiCTy4WUepxvjGIRBaeqMw" ]; then
    echo "✅ Test 1 PASSED: URL extracted correctly"
else
    echo "❌ Test 1 FAILED: Expected zpkd1://api-mifit-de2.zepp.com/custom/tools/app-dial/download/1JVjqGQu1eiCTy4WUepxvjGIRBaeqMw"
    echo "   Got: $EXTRACTED_URL"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Test case 2: URL only (no debug messages)
cat > "$TEMP_FILE" <<'EOF'
zpkd1://api-mifit-de2.zepp.com/custom/tools/app-dial/download/1JVjqGQu1eiCTy4WUepxvjGIRBaeqMw
EOF

echo "Test 2: Extracting URL from clean output..."
EXTRACTED_URL=$(grep -oP '^(zepp|zpkd1|https)://[^\s\r\n]+' "$TEMP_FILE" | head -1 || echo "")

if [ "$EXTRACTED_URL" = "zpkd1://api-mifit-de2.zepp.com/custom/tools/app-dial/download/1JVjqGQu1eiCTy4WUepxvjGIRBaeqMw" ]; then
    echo "✅ Test 2 PASSED: URL extracted correctly"
else
    echo "❌ Test 2 FAILED: Expected zpkd1://api-mifit-de2.zepp.com/custom/tools/app-dial/download/1JVjqGQu1eiCTy4WUepxvjGIRBaeqMw"
    echo "   Got: $EXTRACTED_URL"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Test case 3: Different URL protocol (https)
cat > "$TEMP_FILE" <<'EOF'
Some debug message
https://example.com/some/path?query=123
Another debug message
EOF

echo "Test 3: Extracting HTTPS URL from mixed output..."
EXTRACTED_URL=$(grep -oP '^(zepp|zpkd1|https)://[^\s\r\n]+' "$TEMP_FILE" | head -1 || echo "")

if [ "$EXTRACTED_URL" = "https://example.com/some/path?query=123" ]; then
    echo "✅ Test 3 PASSED: HTTPS URL extracted correctly"
else
    echo "❌ Test 3 FAILED: Expected https://example.com/some/path?query=123"
    echo "   Got: $EXTRACTED_URL"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Test case 4: No URL present
cat > "$TEMP_FILE" <<'EOF'
No URL in this output
Just some debug messages
EOF

echo "Test 4: Handling output with no URL..."
EXTRACTED_URL=$(grep -oP '^(zepp|zpkd1|https)://[^\s\r\n]+' "$TEMP_FILE" | head -1 || echo "")

if [ -z "$EXTRACTED_URL" ]; then
    echo "✅ Test 4 PASSED: Correctly detected no URL"
else
    echo "❌ Test 4 FAILED: Expected empty string"
    echo "   Got: $EXTRACTED_URL"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Clean up
rm -f "$TEMP_FILE"

echo ""
echo "================================================"
echo "✅ All tests passed!"
echo "================================================"
