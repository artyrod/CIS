const mongoose = require('mongoose');
const { GridFsStorage } = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
require('dotenv').config();

const mongoURI = process.env.MONGO_URI;

// Connect to MongoDB
const conn = mongoose.createConnection(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

let gfs;
conn.once('open', () => {
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('uploads'); // Name of the collection in MongoDB
});

const storage = new GridFsStorage({
    url: mongoURI,
    file: (req, file) => {
        return {
            filename: file.originalname,
            bucketName: 'uploads', // GridFS Collection Name
            metadata: { contentType: file.mimetype },
        };
    },
});

const upload = require('multer')({ storage });

module.exports = { gfs, upload };