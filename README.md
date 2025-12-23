# QFMT - HTML Version

This is an HTML version of the QFMT (Quick Frequency and Music Training) application, converted from the original WPF version.

## Features

- Input and manage musical notes
- Generate combinations and permutations of notes
- Play notes and combinations
- Control playback parameters (level, timing, etc.)
- Random play and repeat functions
- Keyboard shortcuts for common actions

## Setup

1. **音频文件设置 (Audio Files Setup):**
   - The original application used audio files from: `D:\QTools\QWeb\Mt\ConsoleApp1\piano\`
   - For this HTML version, create a folder named `piano` in the same directory as the HTML file
   - Copy the MP3 files from the original location, or obtain new ones (see below)
   - The audio files should be named in the format `[NOTE][LEVEL].mp3` (e.g., `C4.mp3`, `D5.mp3`)

2. **如何获取音频文件 (How to Obtain Audio Files):**
   - Option 1: Copy from the original WPF application
   - Option 2: Download piano note MP3 files from an online resource
   - Option 3: Generate using a digital audio workstation or piano app

3. **音符映射 (Note Mapping):**
   - The application uses the following mapping for note numbers to names:
     - 1 -> C
     - 2 -> D
     - 3 -> E
     - 4 -> F
     - 5 -> G
     - 6 -> A
     - 7 -> B

## How to Use

1. Open `index.html` in a web browser.
2. Add notes by entering them in the "输入音组" field and clicking "添加".
   - Notes can include offsets, e.g., "+1", "-2", "3", etc.
3. Select a note from the list to see its combinations.
4. Use the buttons to play notes or combinations:
   - "播放(W)" - Play a random selection of notes
   - "重播(Q)" - Replay the last selection
   - "随机播组(S)" - Play a random combination from the selected ones
   - "重播组合(A)" - Replay the last combination

## Keyboard Shortcuts

- Q - Repeat the last played notes
- W - Play notes
- A - Repeat the last played combination
- S - Play a random combination from the selected ones

## Settings

- **Level**: Sets the base level for playback (default: 4)
- **播放时间 (毫秒)**: Sets the duration of each note (default: 800ms)
- **播放间隔 (毫秒)**: Sets the interval between notes (default: 800ms)
- **随机播放**: When checked, plays notes in random order
- **播放标准音**: When checked, plays the standard note after the modified note
- **固定首音**: When checked, ensures the specified note is played first
- **数量**: Sets the number of notes to play

## Data Storage

The application stores notes in the browser's local storage, so they persist between sessions. It will also try to load notes from the provided `notes.txt` file on first run.

## Browser Compatibility

This application works best in modern browsers that support the Web Audio API and ES6 JavaScript features. 

## LAN Phone Access + Offline (PWA)

Service Worker (offline cache) requires a **secure context**:
- Works on `http://localhost/...` without certificates
- For **LAN phone access** (e.g. `https://192.168.x.x:8443/`), you need **HTTPS with a trusted certificate** on the phone

### Option A: Recommended (mkcert)

1. Install `mkcert` on your PC and create a local CA.
2. Generate a certificate for your LAN IP (replace IP):
   - `mkcert 192.168.1.3`
   - This creates `192.168.1.3.pem` and `192.168.1.3-key.pem`
3. Install the mkcert root CA on your phone (so the cert is trusted):
   - On PC: `mkcert -CAROOT` to locate the root CA
   - Copy `rootCA.pem` to phone and install it as a user certificate (Android)
4. Start HTTPS server:
   - `node server.js --host 0.0.0.0 --port 8443 --cert 192.168.1.3.pem --key 192.168.1.3-key.pem`
5. On phone open:
   - `https://192.168.1.3:8443/`
6. Visit once online, then you can go offline and refresh (core files are cached; audio is cached after first play).
