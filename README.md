# Zeitgeber

Zeitgeber is a private analytics app for Amazfit watches. It turns your heart rate, sleep and activity data into detailed charts, and it keeps that data encrypted on your own device.

The whole app is one HTML file, with a small `sw.js` beside it that lets the installed app start offline. There is no account, no server and no tracking. You can install it on a phone or computer as a web app, or just open `index.html` in a browser.

Zeitgeber is an independent project. It is not connected to Amazfit or Zepp Health, and it is not a medical device. Its charts show patterns in your data and should not be used for diagnosis.

<img width="745" height="385.5" alt="sleep image" src="https://github.com/user-attachments/assets/97c796e7-ce83-429f-a98a-0f410f6b5c61" />


## Using it

The app is at:

https://jimliddle.github.io/Zeitgeber/

To host your own copy:

1. Open **Settings > Pages** in this repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick the branch that holds `index.html` and the `/ (root)` folder, then save.

Installing needs HTTPS, which GitHub Pages provides.

## Installing the app

- **Chrome or Edge on a computer or Android phone:** open the Vault page and press **Install app**. If the button isn't there, use the browser menu and choose **Install app** or **Add to Home screen**.
- **iPhone or iPad:** open the page in Safari, tap **Share**, then **Add to Home Screen**.

After your first visit, the app starts without a connection. When you're online it loads the latest version, and if the network fails or takes more than three seconds it uses the copy saved on your device. Syncing with Zepp still needs a connection.

## First run

1. Choose a passphrase of at least 12 characters. **It cannot be reset.** If you lose it, your data is gone.
2. Add your data on the Sources page, or press **Explore with sample data** to look around first.
3. Download an encrypted backup from the Vault page now and then.

Each browser keeps its own separate vault, and so does an app installed on an iPhone. To move your data, download a backup in one place and restore it in the other. You will need the passphrase you were using when the backup was made.

## Getting your data in

**Zepp export.** This is the most reliable route. In the Zepp app, look for **Export data** in your profile or account settings. Menu names vary between versions. Drop the ZIP on the Sources page and enter its password if it has one. You can import overlapping exports, and duplicates are merged.

The export mixes UTC and local times, and in the exports used for testing the minute-by-minute sleep rows were dated a day late. Zeitgeber measures and corrects both, then tells you what it did.

**Zepp cloud sync.** Zepp has no public API, so this uses a private one that was worked out by community developers. It may stop working at any time, and it may not be allowed by Zepp's terms. You copy a token from your own login and never enter your Zepp password. Tokens last about 30 days. The Sources page explains how to find one.

Zepp's servers may refuse requests from a web page. If that happens, the app offers a small Python script that runs on your computer and passes the requests on. It accepts only requests carrying your private key, and it forwards only to Zepp. It needs a computer, so it won't help on a phone.

**Live heart rate.** Turn on Heart Rate Push on the watch, then connect from the Sources page. This uses Web Bluetooth, so it needs Chrome or Edge on a computer or Android phone. It does not work on an iPhone.

A web page can't download your history directly from the watch, so past data has to come through Zepp.

## What it shows

- A heat map of every minute of heart rate, movement or sleep. Drag across it to zoom in.
- Resting heart rate trends, with unusual days and lasting changes marked.
- Your daily heart rate rhythm, shown on a 24-hour dial.
- Sleep timing, stages and regularity, plus sleep debt and the gap between your weekday and weekend sleep.
- Training load, a calendar view and workout history.
- Links between measures, including delayed effects such as today's training and tomorrow's resting heart rate.
- Comparisons of days you have tagged, such as alcohol, travel or illness.

Every chart can be filtered by date, weekday, tag or a condition such as "sleep at least 7 hours". Charts and whole pages can be saved as PNG images, and daily data can be saved as CSV.

Correlations are corrected for the number of comparisons made and for how much one day resembles the next. They can still only show that two things move together, not that one causes the other.

## Privacy and security

- All data is stored in the browser's IndexedDB, encrypted with AES-256-GCM. Your Zepp token is encrypted too.
- Your passphrase is run through PBKDF2-SHA-256 one million times to unlock a random master key.
- Record names are hashed, so the database doesn't show which dates or data types it holds.
- The app locks after a period of inactivity, and when you return to it after that period has passed.
- A content security policy inside the file blocks outside scripts and all connections except Zepp and the local relay.
- `sw.js` saves a copy of the app page and nothing else. Your data never passes through it.

There are limits to this:

- Encryption protects data at rest. It can't protect you from malware or browser extensions while the app is unlocked.
- Saved images, CSV files and the relay script are not encrypted. Encrypted backups are.
- Anyone who can push to the repository you load the app from can change the code you run. If that worries you, host your own copy or use the file offline.

## Known limits

- Testing so far has used real Zepp exports, desktop Chrome and emulated phones. It has not been tried on a physical phone or a real Amazfit watch.
- Cloud sync has only been tested against a mock server, because it needs a real Zepp account.
- Because the app has no separate manifest file, Android may add it as a home screen shortcut instead of a full app. It should still open in its own window.
- Saving files from the installed app on a phone uses the system share sheet, so it may behave differently between devices.

## Changing the code

`index.html` is generated, so edit the files in `src/` and rebuild it. `sw.js` is written by hand and isn't part of the build.

```
python3 build.py
```

This needs Python 3 and no other packages. It joins the source files, embeds the fonts and icons, and updates the hashes in the content security policy.

Running `python3 build.py --test` writes a test build to `dist/`. It exposes internals to browser tests, so don't publish it.

## Licence

MIT, see [LICENSE](LICENSE). The fonts and sport names have their own licences, listed in [THIRD_PARTY.md](THIRD_PARTY.md).
