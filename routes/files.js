const express = require('express');
const { gfs, upload } = require('../backend/database');
const router = express.Router();

// 📌 Upload a file
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.json({ file: req.file });
});

// 📌 Retrieve all files
router.get('/files', async (req, res) => {
    try {
        const files = await gfs.files.find().toArray();
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 📌 Get a file by filename and serve it
router.get('/files/:filename', async (req, res) => {
    try {
        const file = await gfs.files.findOne({ filename: req.params.filename });
        if (!file) return res.status(404).json({ error: 'File not found' });

        const readStream = gfs.createReadStream(file.filename);
        readStream.pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 📌 Delete a file by ID
router.delete('/files/:id', async (req, res) => {
    try {
        await gfs.files.deleteOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
        res.json({ message: 'File deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;