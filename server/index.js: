import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dgram from 'dgram';
import Renderer from 'upnp-mediarenderer-client';

const app = express();
const PORT = 3000;
app.use(express.static('../client'));

// 👇 CHANGE THIS TO YOUR MEDIA FOLDER
const MEDIA_FOLDER = "smb://192.168.0.211/2TB/Movies.2TB"; 

let devices = [];

/* =========================
   GET LOCAL IP
========================= */
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
}

/* =========================
   DISCOVER TV (DLNA)
========================= */
function discoverDevices() {
    const socket = dgram.createSocket('udp4');

    const message = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 2\r\n' +
        'ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n'
    );

    socket.on('message', (msg) => {
        const str = msg.toString();
        const match = str.match(/LOCATION: (.*)/i);
        if (match) {
            const location = match[1].trim();
            if (!devices.includes(location)) {
                devices.push(location);
                console.log("Found TV:", location);
            }
        }
    });

    socket.send(message, 0, message.length, 1900, '239.255.255.250');
}

discoverDevices();

/* =========================
   API: LIST MOVIES
========================= */
app.get('/movies', (req, res) => {
    const files = fs.readdirSync(MEDIA_FOLDER)
        .filter(f => f.endsWith('.mp4') || f.endsWith('.mkv'));

    res.json(files);
});

/* =========================
   API: PLAY MOVIE
========================= */
app.get('/play', (req, res) => {
    const file = req.query.file;

    if (!file) return res.send("No file");

    if (devices.length === 0) {
        return res.send("No TV found");
    }

    const mediaURL = `http://${getLocalIP()}:${PORT}/media/${encodeURIComponent(file)}`;

    const client = new Renderer(devices[0]);

    client.load(mediaURL, { autoplay: true }, (err) => {
        if (err) {
            console.log(err);
            return res.send("Failed");
        }
        res.send("Playing");
    });
});

/* =========================
   SERVE FILES
========================= */
app.use('/media', express.static(MEDIA_FOLDER));

/* =========================
   START
========================= */
app.listen(PORT, () => {
    console.log(`FreeStream running: http://localhost:${PORT}`);
});
