# Gitam Auto Captcha Rebuilt

Author: Newton Mishra

---

## What Happened

Gitam dumped Google reCaptcha and went back to ASP.NET server images (`CaptchaImage.ashx`). The new captcha is 5 spaced digits (0-9) with faint gray scratch lines and pepper noise.

No more reCaptcha bypass scripts or iframes. Everything runs locally in the extension with zero external servers.

---

## How It Works

1. **vibeCheck**: Reads student credentials and pause state from local storage.
2. **dropDoxx**: Types username into `#txtusername` and password into `#password`.
3. **nukeNoise**: Pulls the `#imgCaptcha` element onto an offscreen canvas and applies Otsu binarization. Faint scratches and noise dots get wiped out, leaving clean black digits on white background.
4. **chopDigits**: Scans column density across the canvas to segment the 5 distinct digit bounding boxes. If numbers get squished together, it splits them evenly.
5. **cookDigit**: Scales each digit into an 8x12 density matrix, counts internal loops/holes (e.g. two holes for 8, one hole for 0/6/9, zero holes for 1/2/3/5/7), and compares against pre-rendered system font templates.
6. **yeetForm**: Slaps the 5 solved numbers into `#txtCaptchaInput` and clicks `#Submit`.
7. **Observer**: Watches `#imgCaptcha` for src attribute changes so if the captcha reloads, it re-solves immediately.

---

## Project Structure

- `manifest.json`: Manifest V3 config with content script targeting login.gitam.edu.
- `main.js`: Main solver, preprocessor, and form submission engine.
- `popup.html` / `popup.js` / `popup.css`: Extension popup for saving credentials.
- `background.js`: Service worker for credential storage and pause toggle.
- `graveyard.js`: Dump file holding all obsolete reCaptcha and DOM span experiments.
