# AR Museum Viewer

A lightweight web-based AR viewer for museum artifacts using Three.js and AR.js (marker-based).

## Features
- Load 3D models (GLB/GLTF format)
- 3D orbit viewer with smooth controls
- Cross-origin file fetching proxy for loading models directly from Google Drive public links
- Augmented Reality mode using AR.js and a Hiro marker
- Mobile-responsive premium museum UI

## Setup & Running

1. **Install Dependencies** (for the proxy server):
   ```bash
   npm install
   ```

2. **Start the Application**:
   ```bash
   npm start
   ```
   This starts the Node.js server which serves both the frontend web app and handles CORS proxying for Google Drive downloads.
   
   The app will be available at: `http://localhost:3000`

## Configuration

Models are configured in `data/models.json`

```json
{
  "proxyUrl": "http://localhost:3000/proxy?url=",
  "artifacts": [
    {
      "id": "item1",
      "name": "Bust of Nefertiti",
      "description": "...",
      "modelUrl": "https://drive.google.com/uc?export=download&id=YOUR_FILE_ID"
    }
  ]
}
```

Google Drive links MUST be formatted as: `https://drive.google.com/uc?export=download&id=YOUR_FILE_ID_HERE`
Ensure the file sharing permissions in Google Drive are set to "**Anyone with the link**".

## Using AR Mode

1. Print the standard AR.js Hiro Marker:
   You can find it at `assets/markers/patt.hiro` or grab an image online (search "Hiro marker").
2. Open the application.
3. Click "View in AR".
4. Allow camera permissions when prompted.
5. Point your device camera at the Hiro marker and the 3D artifact will appear on top of it.

> **Note on Mobile Testing:**
> Browsers require a secure context (HTTPS) or `localhost` to access the camera. If you are testing on your phone over a local LAN (e.g., `http://192.168.1.10:3000`), the camera will not work. To solve this, you can use a tunneling service like **ngrok**:
> ```bash
> npx ngrok http 3000
> ```
> Then open the provided `https://...` link on your phone.
