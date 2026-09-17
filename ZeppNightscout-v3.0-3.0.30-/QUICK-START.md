# Quick Start Guide

Get the ZeppNightscout app running on your watch in just a few minutes!

## 🚀 Fastest Way to Test

Use `zeus preview` to install the app via QR code - **no cables needed!**

### Step 1: Install Prerequisites

```bash
# Install Zeus CLI
npm install -g @zeppos/zeus-cli
```

### Step 2: Enable Developer Mode

1. Open **Zepp App** on your phone
2. Go to **Profile** → **Settings** → **About**
3. Tap the **Zepp icon** 7 times
4. Developer Mode is now enabled! ✅

### Step 3: Login to Zeus (First Time Only)

```bash
zeus login
```

Enter your Zepp developer account credentials.  
Don't have an account? Register at [developers.zepp.com](https://developers.zepp.com/)

### Step 4: Generate QR Code

```bash
# Navigate to the project
cd ZeppNightscout

# Generate QR code
zeus preview
```

**Or use the npm script:**
```bash
npm run preview
```

The terminal will show a QR code after selecting your watch model.

### Step 5: Install to Your Watch

1. Open **Zepp App** on your phone
2. Go to **Profile** → **[Your Device]** → **Developer Mode**
3. Tap **Scan**
4. Point your camera at the QR code in your terminal
5. Done! The app installs to your watch 🎉

### Step 6: Configure & Test

1. Open the **Nightscout** app on your watch
2. Configure your Nightscout URL by editing `page/index.js` line 18:
   ```javascript
   apiUrl: 'https://your-nightscout.herokuapp.com',
   ```
   Change it to your actual Nightscout URL, then run `zeus preview` again to generate a new QR code with your changes and scan it to update the app.
3. Tap "Fetch Data" to load glucose readings
4. Watch your CGM data appear!

## 📱 What You'll See

After installation, the Nightscout app will display:
- **Current Blood Glucose Value** - Large, easy to read
- **Trend Arrow** - Shows if glucose is rising or falling
- **Delta** - Change from previous reading
- **Last Update Time** - When data was last fetched
- **Graph** - Visual trend of last 200 readings

## 🔄 Making Changes

After editing code, test your changes instantly:

```bash
# Make your code changes
# Then regenerate QR code
zeus preview

# Scan the new QR code in Zepp App
# Your updated app installs immediately!
```

## 📚 Need More Help?

- **Quick Commands**: See [TESTING-QUICK-REFERENCE.md](docs/TESTING-QUICK-REFERENCE.md)
- **Detailed Testing**: See [TESTING.md](docs/TESTING.md)
- **Development**: See [DEVELOPMENT.md](DEVELOPMENT.md)
- **Project Overview**: See [README.md](README.md)

## ⚡ Why `zeus preview` is Great

✅ **No cables** - completely wireless  
✅ **Fast** - installs in seconds  
✅ **Simple** - just scan a QR code  
✅ **Iterative** - perfect for testing changes  
✅ **Portable** - works anywhere with internet  

## 🎯 Next Steps

1. **Configure Nightscout URL**: Edit your URL in the code
2. **Test Data Fetching**: Try with your real Nightscout instance
3. **Customize**: Adjust colors, layout, features
4. **Contribute**: Found a bug? Open an issue!

## 💡 Tips

- The QR code expires after some time - just run `zeus preview` again
- You can test on multiple watches easily - just scan on different devices
- Keep the terminal window visible while scanning
- Make sure your phone and watch are connected via Bluetooth

## 🐛 Troubleshooting

**QR code doesn't work?**
- Check you selected the right watch model
- Verify your Zepp App is version 6.6.0+
- Make sure accounts match (Zeus CLI login = Zepp App account)

**Can't find Developer Mode?**
- Tap the Zepp icon 7 times in Profile → Settings → About
- Restart the Zepp App if needed

**More issues?**
- See the detailed troubleshooting section in [TESTING.md](docs/TESTING.md)

---

**Ready to start?** Run `zeus preview` and start testing! 🚀
