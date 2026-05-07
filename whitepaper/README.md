# Sky Predict Whitepaper Site

Standalone static whitepaper website for Sky Predict.

## Files

```text
whitepaper-site/
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
python -m http.server 8081
```

Open:

```text
http://localhost:8081
```

You can also open `index.html` directly in a browser.

## Deployment

Upload the full `whitepaper-site/` folder contents to any static host:

- Nginx
- Apache
- Netlify
- Vercel static deployment
- Cloudflare Pages
- Any object storage/static server

For Nginx, set the document root to this folder and serve `index.html` as the default file.

## Notes

- No wallet connection is included.
- No private keys or env values are required.
- Update whitepaper copy whenever contracts, fee model, or scheduler behavior changes.
