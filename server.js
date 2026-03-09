const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Serve static static files from the project root
app.use(express.static(path.join(__dirname, '')));

/**
 * Proxy route for bypassing CORS on Google Drive links.
 * Usage: /proxy?url=YOUR_GOOGLE_DRIVE_DOWNLOAD_LINK
 */
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing "url" query parameter' });
    }

    try {
        console.log(`Proxying request for: ${targetUrl}`);
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                // Avoid compression issues that sometimes arise with node-fetch vs Google Drive
                'Accept-Encoding': 'identity',
                // Avoid Google dropping connections from headless clients
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch from Google Drive: ${response.statusText}`);
        }

        // Copy over essential headers including Content-Type
        const contentType = response.headers.get('content-type');
        const contentDisposition = response.headers.get('content-disposition');
        
        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);

        // Pipe the file stream to the client
        response.body.pipe(res);
        
    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Export the Express API for Vercel
module.exports = app;

// Only listen if run directly (Local Development)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`=================================`);
        console.log(` Museum Viewer Proxy Server      `);
        console.log(`=================================`);
        console.log(` App available at: http://localhost:${PORT}`);
        console.log(` Proxy available at: http://localhost:${PORT}/proxy?url=...`);
    });
}
