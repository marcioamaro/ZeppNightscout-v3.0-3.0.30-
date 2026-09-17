# ZeppNightscout

An app for Zepp OS that connects to Nightscout instance and displays CGM data.

## Features

### Three-Page Navigation System
- **Page 1: Main Metrics** - Large BG display, trend arrow, delta, and last update
- **Page 2: Glucose Graph** - Detailed graph with zoom controls (displays 200 data points)
- **Page 3: Settings/History** - API configuration, token validation, and data history
- **Tap Navigation** - Tap left/right edges to navigate between pages

### Core Features
- **Settings Text Field**: Configure your Nightscout API URL
- **URL Verification**: Verify your Nightscout URL before fetching data (uses `/api/v1/status` endpoint)
- **Token Validation**: Validate API tokens with security status indicators
- **Glucose Graph**: Visual representation of recent glucose readings with zoom (0.5x to 3.0x)
- **Calculated Values**: Display current BG, trend arrow, delta, and last update time
- **Internet Connectivity**: Fetches real-time data from Nightscout API
- **Pixel-Perfect Display**: 200 values for detailed trend visualization

## Development Setup

### Quick Start

**New to the project?** See [QUICK-START.md](QUICK-START.md) for the fastest way to get the app running on your watch using `zeus preview`!

### Using GitHub Codespaces

This project is configured for GitHub Codespaces with GitHub Copilot support:

1. Click "Code" → "Create codespace on main"
2. The dev container will automatically:
   - Set up Node.js 20
   - Install dependencies
   - Configure VS Code with ESLint, Prettier, and GitHub Copilot extensions
   - Forward port 8080 for development server

## Testing

For detailed testing instructions, see the [Testing Guide](docs/TESTING.md).

### Quick Testing with Browser Simulator (F5)

**NEW!** Test the app instantly in your browser without any device or Zeus CLI:

![Zepp Nightscout Simulator](https://github.com/user-attachments/assets/bb4f4591-4bfc-463a-b7f1-071d6b2bb8f1)

```bash
# Press F5 in VS Code (recommended)
# or
npm run simulator
```

This opens a browser-based simulator that:
- ✅ Runs locally on port 8080
- ✅ Works in GitHub Codespaces with port forwarding
- ✅ Opens automatically in your browser
- ✅ Supports real Nightscout API testing
- ✅ Includes mock data for offline testing
- ✅ No device or Zeus CLI required

See [simulator/README.md](simulator/README.md) for detailed documentation.

### Automated Testing

This project uses GitHub Actions to automatically run tests on every pull request:

- ✅ JavaScript syntax validation
- ✅ Unit tests (26 assertions)
- ✅ Build validation (31 assertions)
- ✅ Actual app build with Zeus CLI
- ✅ Command verification

All tests must pass before merging.

### Quick Start

```bash
# Quick browser testing (no device needed)
npm run simulator

# Test data parser
npm test

# Check JavaScript syntax
npm run test:syntax

# Validate build requirements
npm run test:build

# Build and run in Zeus simulator (requires Zeus CLI)
npm run dev
```

## Building for Zepp OS

To build this app for Zepp OS devices, you'll need the Zepp OS development tools. Follow the official [Zepp OS documentation](https://docs.zepp.com/) for setup instructions.

### Quick Build

```bash
# Install Zeus CLI
npm install -g @zeppos/zeus-cli

# Build the app
zeus build --production

# Install to connected device
zeus install
```

### Quick Testing with QR Code

The easiest way to test the app on your watch is using `zeus preview`:

```bash
# Install Zeus CLI (if not already installed)
npm install -g @zeppos/zeus-cli

# Login to Zeus (one-time setup)
zeus login

# Generate QR code for quick install
zeus preview
```

Then:
1. Enable Developer Mode in Zepp App (tap Zepp icon 7 times in Profile → Settings → About)
2. Go to Profile → Your Device → Developer Mode in the Zepp App
3. Tap "Scan" and scan the QR code shown in your terminal
4. The app will be installed directly to your watch

For detailed build and deployment instructions, see [TESTING.md](docs/TESTING.md).

## API Integration

The app connects to Nightscout API using the following endpoints:

### Configuration

The app now supports **separate URL and token configuration** for better security:

1. **API URL**: Enter your Nightscout instance URL (must use HTTPS)
2. **API Token**: Enter your read-only access token separately

### URL Verification
```
GET {nightscout-url}/api/v1/status
```
This endpoint is used to verify the Nightscout URL. The URL must use HTTPS for security.

### Token Validation

The app includes a comprehensive token validation system:

- **Click the ? icon** next to the token field to validate your token
- **Read Access Test**: Verifies the token can access the status endpoint
- **Admin Access Test**: Checks if the token has write/admin permissions

**Token Validation States:**
- `?` (Gray): Token not yet validated
- `⌛` (Gray): Validation in progress
- `✅` (Green): Token is read-only (safe - recommended)
- `❗` (Red): Token has admin access (dangerous - not recommended)
- `✗` (Red): Token is invalid or unauthorized

### Data Fetching
```
GET {nightscout-url}/api/v1/entries.json?count=200&token={api-token}
```
Fetches 200 glucose readings for detailed trend visualization (one value per pixel for ~200px screen width).

### Security

**Important**: Always use a token with **read-only access** to protect your data. 

To configure read-only access tokens:
1. Visit your Nightscout instance admin panel
2. Create a new token with read-only permissions
3. Enter the URL and token separately in the app configuration
4. Click the `?` icon to validate that your token is read-only

The app will warn you if your token has admin/write permissions, which is a security risk.

For more information about Nightscout security and token configuration, see:
- [Nightscout Security Documentation](http://www.nightscout.info/wiki/welcome/website-features/0-9-features/authentication-roles)
- [Nightscout Setup Guide](http://www.nightscout.info/)

Expected response format:
```json
[
  {
    "sgv": 120,
    "direction": "Flat",
    "dateString": "2023-12-07T12:00:00.000Z",
    "date": 1701950400000
  }
]
```

## Configuration

The app configuration is now split into two fields for better security:

1. Abra **Ajustes → Servidor → Digitar URL** e informe a URL base da sua instância.
2. Se sua instância exigir autenticação, toque em **Token: opcional** e informe um token com papel `readable`.
3. O relógio guarda apenas o indicador de que há token; o token é mantido no lado do telefone e não é exibido após o salvamento.
4. Toque em **Testar Conexão**. Um erro 401/403 indica token inválido ou sem permissão de leitura.

**Important**: 
- The URL must use HTTPS (HTTP URLs will be rejected)
- Use the token validation feature (click `?` icon) to ensure your token is read-only
- Never use admin/write tokens in production

## Technologies Used

- **Zepp OS SDK**: For device-side UI and app-side services
- **JavaScript**: Programming language
- **Canvas API**: For graph rendering
- **Fetch API**: For HTTP requests to Nightscout

## References

- [Zepp OS Documentation](https://docs.zepp.com/)
- [Zepp OS Samples](https://github.com/zepp-health/zeppos-samples)
- [Nightscout API](http://www.nightscout.info/)

## Debugging and Logs

### Viewing App-Side Logs

App-side code runs on your phone (inside the Zepp app), not on the watch. To view these logs:

- **During Development**: Use `zeus dev` simulator - shows both device and app-side logs
- **On Android Phone**: Use `adb logcat | grep jsapp` to view Zepp app logs
- **On iOS Phone**: No direct access - use simulator for debugging

See [VIEWING-APP-SIDE-LOGS.md](docs/VIEWING-APP-SIDE-LOGS.md) for comprehensive instructions.

### Viewing Device-Side Logs

Device-side code runs on the watch. To view these logs:

```bash
# Connect to watch via WiFi or USB
adb connect <watch-ip>:5555

# View watch logs
adb logcat | grep Nightscout
```

## License

MIT
