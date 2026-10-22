const express = require('express');
const fs = require('fs');
const path = require('path');
const apiRouter = require('./api');

const DATA_DIR = path.resolve(__dirname, 'data');
// Same shape send uses after it normalizes a URL. A match means the path
// climbs out of the static root, which send rejects before streaming.
const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

function decodeStaticPath(urlPath) {
    try {
        return decodeURIComponent(urlPath);
    } catch {
        return null;
    }
}

function pathSendWouldStream(urlPath, root) {
    const decoded = decodeStaticPath(urlPath);
    if (decoded === null || decoded.indexOf('\0') !== -1) {
        return null;
    }
    const normalized = path.normalize('.' + path.sep + decoded);
    if (UP_PATH_REGEXP.test(normalized)) {
        return null;
    }
    return path.resolve(root, normalized);
}

function isPathInside(parent, candidate) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return relative === '' || (
        relative !== '..' &&
        !relative.startsWith('..' + path.sep) &&
        !path.isAbsolute(relative)
    );
}

function resolvedPathIsInsideDataDirectory(filePath) {
    const candidates = [path.resolve(filePath)];
    try {
        candidates.push(fs.realpathSync(filePath));
    } catch {
        // Missing files have no symlink target. The lexical path still counts.
    }
    const dataDirs = [DATA_DIR];
    try {
        const realData = fs.realpathSync(DATA_DIR);
        if (realData !== DATA_DIR) {
            dataDirs.push(realData);
        }
    } catch {
        // The data directory is created on startup; a missing one is still closed.
    }
    return candidates.some((candidate) => dataDirs.some((dir) => isPathInside(dir, candidate)));
}

function pathsSendWouldStream(urlPath, root) {
    const filePath = pathSendWouldStream(urlPath, root);
    if (!filePath) {
        return [];
    }
    // send's default index is index.html, and only when the raw path ends in '/'.
    // The directory can sit outside data/ while that index file resolves inside it.
    if (urlPath.endsWith('/')) {
        return [filePath, path.join(filePath, 'index.html')];
    }
    return [filePath];
}

function staticFilesOutsideData(root) {
    const resolvedRoot = path.resolve(root);
    const serve = express.static(resolvedRoot);
    return function serveStaticOutsideData(req, res, next) {
        if (req.method === 'GET' || req.method === 'HEAD') {
            const filePaths = pathsSendWouldStream(req.path, resolvedRoot);
            if (filePaths.some((filePath) => resolvedPathIsInsideDataDirectory(filePath))) {
                res.status(404).end();
                return;
            }
        }
        serve(req, res, next);
    };
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the Apache reverse proxy for correct client IP in rate limiting
app.set('trust proxy', 1);

// Parse JSON bodies (before API routes)
app.use(express.json({ limit: '2mb' }));

// Balanced cache control middleware
app.use((req, res, next) => {
    if (req.path.match(/\.html$/)) {
        res.set({ 'Cache-Control': 'public, max-age=3600' });
    } else if (req.path.match(/\.(css|js)$/)) {
        res.set({ 'Cache-Control': 'public, max-age=86400' });
    } else if (req.path.match(/manifest\.json$/)) {
        res.set({ 'Cache-Control': 'public, max-age=3600' });
    } else if (req.path.match(/\.(png|jpg|jpeg|gif|ico|svg)$/)) {
        res.set({ 'Cache-Control': 'public, max-age=31536000' });
    }
    next();
});

// API routes (before static files and catch-all)
app.use('/api', apiRouter);

// Block access to data directory (contains database and secrets)
app.use('/data', (req, res) => res.status(404).end());

// Serve static files. send decodes and normalizes the URL after routing, so
// the /data prefix block above does not see every path that will be streamed.
// Refuse the file when that resolved path, or its symlink target, is inside
// the data directory.
app.use(staticFilesOutsideData(__dirname));

// Serve index.html for all routes (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Bountywell server running on port ${PORT}`);
        console.log(`Visit: http://localhost:${PORT}`);
    });
}

module.exports = app;
