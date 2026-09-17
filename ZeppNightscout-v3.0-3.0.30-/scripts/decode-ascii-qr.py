#!/usr/bin/env python3
"""
Decode QR code from ASCII art output by zeus preview command.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

def extract_qr_ascii(text):
    """Extract the ASCII QR code block from text."""
    lines = text.split('\n')
    qr_lines = []
    in_qr = False
    start_pattern_found = False
    
    for line in lines:
        # QR codes start with a line that's mostly ▄ characters (decorative border from Zeus CLI)
        if not start_pattern_found and line.startswith('▄' * 10):
            in_qr = True
            start_pattern_found = True
            # Skip the decorative border - don't include it in qr_lines
            continue
        elif in_qr:
            # Continue collecting lines until we hit the bottom border or empty line
            # The bottom border is a line that is ALL ▄ characters
            if line.startswith('▄' * 10) and all(c == '▄' for c in line.strip()):
                # This is the decorative bottom border - stop here
                break
            elif line.strip() and any(c in line for c in ['█', '▀', '▄', ' ']):
                qr_lines.append(line)
            elif not line.strip():
                # Empty line indicates end of QR
                break
    
    return qr_lines

# Character dimensions for rendering terminal text
# These are tuned to work with typical monospace fonts for QR code recognition
CHAR_WIDTH = 10
CHAR_HEIGHT = 20

def ascii_qr_to_image(qr_lines, output_path='qr_temp.png'):
    """Convert ASCII QR code to an image by rendering as terminal text.
    
    The key insight is that QR decoders can read the ASCII art when it's 
    rendered as actual text with a monospace font, rather than trying to
    convert the block characters to pixels manually.
    """
    if not qr_lines:
        return None
    
    # Find the maximum line length
    max_width = max((len(line) for line in qr_lines), default=0)
    if max_width == 0:
        return None
    
    # Calculate image size with some padding
    img_width = max_width * CHAR_WIDTH + 20
    img_height = len(qr_lines) * CHAR_HEIGHT + 20
    
    # Create image with black background (like a terminal)
    img = Image.new('RGB', (img_width, img_height), color='black')
    draw = ImageDraw.Draw(img)
    
    # Try to use a monospace font for accurate rendering
    font = None
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
        "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
        "/System/Library/Fonts/Monaco.dfont",  # macOS
        "C:\\Windows\\Fonts\\consola.ttf",  # Windows
    ]
    
    for font_path in font_paths:
        try:
            font = ImageFont.truetype(font_path, 16)
            break
        except (OSError, IOError):
            continue
    
    if font is None:
        # Fallback to default font
        try:
            font = ImageFont.load_default()
        except (OSError, IOError) as e:
            print(f"Warning: Could not load font, using basic rendering: {e}", file=sys.stderr)
    
    # Render each line of the QR code
    for i, line in enumerate(qr_lines):
        y = i * CHAR_HEIGHT + 10
        draw.text((10, y), line, fill='white', font=font)
    
    img.save(output_path)
    return output_path

def decode_qr_image(image_path):
    """Decode QR code from image using pyzbar."""
    try:
        from pyzbar.pyzbar import decode
        img = Image.open(image_path)
        decoded_objects = decode(img)
        if decoded_objects:
            return decoded_objects[0].data.decode('utf-8')
    except ImportError:
        print("pyzbar not available, QR decoding failed", file=sys.stderr)
    except Exception as e:
        print(f"Error decoding QR: {e}", file=sys.stderr)
    
    return None

def main():
    if len(sys.argv) > 1:
        # Read from file
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            text = f.read()
    else:
        # Read from stdin
        text = sys.stdin.read()
    
    # Extract ASCII QR code
    qr_lines = extract_qr_ascii(text)
    
    if not qr_lines:
        print("No QR code found in input", file=sys.stderr)
        sys.exit(1)
    
    print(f"Found QR code with {len(qr_lines)} lines", file=sys.stderr)
    
    # Convert to image
    img_path = ascii_qr_to_image(qr_lines)
    if not img_path:
        print("Failed to convert QR to image", file=sys.stderr)
        sys.exit(1)
    
    print(f"Converted to image: {img_path}", file=sys.stderr)
    
    # Try to decode
    url = decode_qr_image(img_path)
    if url:
        print(url)  # Output the URL to stdout
        sys.exit(0)
    else:
        print("Failed to decode QR code", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
