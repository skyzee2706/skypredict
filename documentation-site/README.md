# Sky Predict Documentation Site

Standalone static operator/developer documentation website for Sky Predict.

## Files

```text
documentation-site/
├── index.html
└── assets/
    ├── app.js
    ├── favicon.png
    ├── logo-main.png
    └── styles.css
```

## Local Preview

From this folder:

```bash
python -m http.server 8082
```

Open:

```text
http://localhost:8082
```

You can also open `index.html` directly in a browser.

## Deployment

Upload the full `documentation-site/` folder contents to any static host:

- Nginx
- Apache
- Netlify
- Vercel static deployment
- Cloudflare Pages
- Any object storage/static server

For Nginx, set the document root to this folder and serve `index.html` as the default file.

## Maintenance

Update this site whenever these files change:

- `contracts/contracts/SkyUSDT.sol`
- `contracts/contracts/MarketFactory.sol`
- `contracts/contracts/PredictionMarket.sol`
- `scripts/auto-market.ts`
- `ecosystem.config.js`
- root `README.md`

## Notes

- No wallet connection is included.
- No private keys or env secrets are required.
- The examples use placeholders for addresses and API keys.
