# WorkoutTracker

A simple app that I can use to track workouts. It's plain HTML, CSS and JavaScript with no build step or backend, and it works offline. All data stays on the phone in localStorage.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and iPhone install tags |
| `style.css` | Dark, mobile-first styles |
| `app.js` | Plan, data, logging, records, chart and history |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest` | Home screen app settings |
| `icons/` | App icons |
| `fonts/` | Oswald heading font and its license, stored here so it works offline |

To change your program, edit `PLAN` at the top of `app.js`.

## Run it locally

Service workers need a web server, so opening `index.html` directly won't give you the full app:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Put it on GitHub Pages

1. Push these files to the `main` branch.
2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then `main` and `/ (root)`, and save.
4. After a minute or two, the app is at `https://<your-username>.github.io/WorkoutTracker/`.

## Add it to your iPhone

1. Open the link in Safari.
2. Tap **Share**, then **Add to Home Screen**.
3. Open the app from the new icon once while online, so it can save itself for offline use.

The home screen app keeps its own data, separate from Safari, so log your workouts from the icon.

## Updating the app

After you push a change, the app downloads it in the background. You'll see the new version the second time you open it.

## Backups

Workouts exist only on your phone, and removing the home screen icon can erase them. Use **History → Export backup** now and then to save a copy to Files.
