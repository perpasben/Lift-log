# LiftLog

Personal gym tracker PWA. Vanilla HTML/CSS/JS, no build step. Data lives in IndexedDB on the device.

- Run tests: `npm test`
- Serve locally: `python3 -m http.server 8080`
- Deploy: push to `main`; the workflow tests, stamps a build id into `sw.js` and `js/version.js`, and publishes to GitHub Pages.
- When adding a new file under `js/`, add it to `ASSETS` in `sw.js`.
