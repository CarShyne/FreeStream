import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
app.use(express.static(path.join(__dirname, '../client')));

const MEDIA_FOLDER = "/Volumes/2TB/Movies.2TB";
const TMDB_API_KEY = "866794356a9e7ac61771ae56bd99e284";
const HLS_TMP = '/tmp/freestream-hls';

if (!fs.existsSync(HLS_TMP)) fs.mkdirSync(HLS_TMP, { recursive: true });

const metadataCache = {};
const activeStreams = {};

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

async function getMetadata(filename) {
    if (metadataCache[filename]) return metadataCache[filename];
    const match = filename.match(/^(.+?)[\.\(](\d{4})/);
    if (!match) return { title: filename, year: null, poster: null, overview: null, rating: null, filename };
    const title = match[1].replace(/\./g, ' ').trim();
    const year = match[2];
    try {
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&year=${year}`;
        const data = await fetch(url).then(r => r.json());
        const movie = data.results?.[0];
        const result = movie ? {
            title: movie.title, year,
            poster: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
            overview: movie.overview, rating: movie.vote_average, filename
        } : { title, year, poster: null, overview: null, rating: null, filename };
        metadataCache[filename] = result;
        return result;
    } catch (err) {
        return { title, year, poster: null, overview: null, rating: null, filename };
    }
}

app.get('/movies', async (req, res) => {
    try {
        const files = fs.readdirSync(MEDIA_FOLDER)
            .filter(f => (f.endsWith('.mp4') || f.endsWith('.mkv')) && !f.startsWith('._'));
        const movies = await Promise.all(files.map(getMetadata));
        res.json(movies);
    } catch (err) {
        res.status(500).json({ error: 'Could not read media folder' });
    }
});

// Open in VLC locally
app.get('/open', (req, res) => {
    const file = req.query.file;
    const fullPath = path.join(MEDIA_FOLDER, file);
    exec(`open -a VLC "${fullPath}"`);
    res.send('ok');
});

// HLS streaming endpoint
app.get('/hls/:streamId/index.m3u8', (req, res) => {
    const { streamId } = req.params;
    const playlistPath = path.join(HLS_TMP, streamId, 'index.m3u8');

    // Wait up to 10s for playlist to appear
    let attempts = 0;
    const wait = setInterval(() => {
        if (fs.existsSync(playlistPath)) {
            clearInterval(wait);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.sendFile(playlistPath);
        } else if (++attempts > 20) {
            clearInterval(wait);
            res.status(404).send('Playlist not ready');
        }
    }, 500);
});

app.get('/hls/:streamId/:segment', (req, res) => {
    const { streamId, segment } = req.params;
    const segPath = path.join(HLS_TMP, streamId, segment);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(segPath);
});

// Start HLS transcode
app.get('/start-stream', (req, res) => {
    const file = req.query.file;
    const tvfile = req.query.tvfile;
    const target = tvfile || file;
    const fullPath = tvfile ? path.join(TV_FOLDER, decodeURIComponent(tvfile)) : path.join(MEDIA_FOLDER, file);
    const streamId = Buffer.from(target).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
    const outDir = path.join(HLS_TMP, streamId);

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // Kill existing stream for this file
    if (activeStreams[streamId]) {
        activeStreams[streamId].kill();
        delete activeStreams[streamId];
    }

    const isMkv = target.toLowerCase().endsWith('.mkv');

    const ffmpeg = spawn('ffmpeg', [
        '-i', fullPath,
        '-c:v', isMkv ? 'hevc_videotoolbox' : 'copy',
        ...(isMkv ? ['-b:v', '4M', '-tag:v', 'hvc1'] : []),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_flags', 'independent_segments',
        '-hls_segment_filename', path.join(outDir, 'seg%03d.ts'),
        path.join(outDir, 'index.m3u8')
    ]);

    activeStreams[streamId] = ffmpeg;
    ffmpeg.stderr.on('data', d => process.stdout.write('.'));
    ffmpeg.on('close', () => delete activeStreams[streamId]);

    const localIP = getLocalIP();
    res.json({ streamId, url: `http://${localIP}:${PORT}/hls/${streamId}/index.m3u8` });
});

// Range request support for MP4
app.get('/stream-mp4', (req, res) => {
    const file = req.query.file;
    const fullPath = path.join(MEDIA_FOLDER, file);
    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;
        const fileStream = fs.createReadStream(fullPath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
        });
        fileStream.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(fullPath).pipe(res);
    }
});

app.use('/media', express.static(MEDIA_FOLDER));

app.listen(PORT, () => {
    console.log(`FreeStream running: http://localhost:${PORT}`);
    console.log(`Local IP: ${getLocalIP()}`);
});

// TV Shows endpoint
const TV_FOLDER = "/Volumes/2TB/Movies.2TB/TV Shows";

async function getTVMetadata(showName) {
    if (metadataCache['tv_' + showName]) return metadataCache['tv_' + showName];
    try {
        const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(showName)}`;
        const data = await fetch(url).then(r => r.json());
        const show = data.results?.[0];
        const result = show ? {
            title: show.name,
            poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
            overview: show.overview,
            rating: show.vote_average,
            type: 'tv',
            showName
        } : { title: showName, poster: null, overview: null, rating: null, type: 'tv', showName };
        metadataCache['tv_' + showName] = result;
        return result;
    } catch(err) {
        return { title: showName, poster: null, overview: null, rating: null, type: 'tv', showName };
    }
}

app.get('/tvshows', async (req, res) => {
    try {
        const shows = fs.readdirSync(TV_FOLDER)
            .filter(f => fs.statSync(`${TV_FOLDER}/${f}`).isDirectory());
        const metadata = await Promise.all(shows.map(getTVMetadata));
        res.json(metadata);
    } catch(err) {
        res.status(500).json({ error: 'Could not read TV folder' });
    }
});

app.get('/tvshows/episodes', (req, res) => {
    const show = req.query.show;
    const showPath = `${TV_FOLDER}/${show}`;
    try {
        const episodes = [];
        const scanDir = (dir, prefix) => {
            fs.readdirSync(dir).forEach(f => {
                const full = path.join(dir, f);
                if (fs.statSync(full).isDirectory()) {
                    scanDir(full, prefix ? prefix + '/' + f : f);
                } else if ((f.endsWith('.mp4') || f.endsWith('.mkv')) && !f.startsWith('._')) {
                    episodes.push({ file: prefix ? prefix + '/' + f : f, name: f });
                }
            });
        };
        scanDir(showPath, '');
        episodes.sort((a, b) => a.file.localeCompare(b.file));
        res.json(episodes);
    } catch(err) {
        res.status(500).json({ error: 'Could not read show folder' });
    }
});

app.use('/tv-media', express.static(TV_FOLDER));

app.get('/clear-cache', (req, res) => {
    Object.keys(metadataCache).forEach(k => delete metadataCache[k]);
    res.send('Cache cleared');
});
