ZenBlock

A powerful and efficient ad-blocking browser extension that blocks ads, trackers, and other unwanted content across the web.
Features

- Blocks display ads, pop-ups, and video ads
- Prevents tracking and protects your privacy
- Lightweight and fast
- Whitelist support for trusted sites
- Easy-to-use interface
- Cross-browser compatibility (Chrome, Firefox, Edge)


For Development

1. Clone or download this repository
2. Open your browser's extension management page:
   - **Chrome/Edge**: `chrome://extensions/`
   - **Firefox**: `about:debugging#/runtime/this-firefox`
3. Enable "Developer mode" (if not already enabled)
4. Click "Load unpacked" and select the extension directory

For Users

1. Download the latest release from the [Releases](https://github.com/yourusername/adblock-pro/releases) page
2. Extract the ZIP file
3. Follow the same steps as "For Development" to load the extension

Usage

1. Click the extension icon in your browser's toolbar to open the popup
2. Toggle the switch to enable/disable ad blocking
3. Click "Settings" to access additional options:
   - Manage whitelisted sites
   - Configure filter lists
   - Adjust update frequency

Building for Production

1. Install dependencies (if any):
   ```bash
   npm install
   ```
2. Build the extension:
   ```bash
   npm run build
   ```
3. The built extension will be in the `dist/` directory

Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Acknowledgments

- Uses filter lists from EasyList and other community-maintained sources
- Icons from [Material Icons](https://material.io/resources/icons/)
