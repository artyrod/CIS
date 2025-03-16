require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const cors = require("cors");
const { Readable } = require("stream");

const User = require("./models/User");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5002;
const REGISTER_CODE = process.env.REGISTER_CODE || "DENTAL2025"; // Registration code

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

let gridFSBucket;
mongoose.connection.once("open", () => {
    gridFSBucket = new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
    console.log("✅ GridFS Ready");
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Register (With Code Requirement)
app.post("/api/register", async (req, res) => {
    const { email, password, registerCode } = req.body;

    if (!email || !password || !registerCode) {
        return res.status(400).json({ error: "Email, password, and registration code required." });
    }

    if (registerCode !== REGISTER_CODE) {
        return res.status(403).json({ error: "Invalid registration code." });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "User already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ email, password: hashedPassword }).save();
        res.status(201).json({ message: "User registered successfully." });
    } catch (error) {
        res.status(500).json({ error: "Server error." });
    }
});

// ✅ Login
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials." });
    }
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
});

// ✅ File Upload with Category
app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file || !req.body.category) {
        return res.status(400).json({ error: "File and category required." });
    }

    const readableStream = new Readable();
    readableStream.push(req.file.buffer);
    readableStream.push(null);

    const uploadStream = gridFSBucket.openUploadStream(req.file.originalname, {
        metadata: { contentType: req.file.mimetype, category: req.body.category }
    });

    readableStream.pipe(uploadStream);

    uploadStream.on("finish", () => res.json({ file: { filename: req.file.originalname } }));
    uploadStream.on("error", (err) => res.status(500).json({ error: "File upload failed.", details: err }));
});

// ✅ Get All Uploaded Files
app.get("/api/files", async (req, res) => {
    try {
        const files = await gridFSBucket.find().toArray();
        res.json(files.map(file => ({
            filename: file.filename,
            id: file._id,
            contentType: file.metadata?.contentType || "unknown",
            category: file.metadata?.category || "Uncategorized"
        })));
    } catch (error) {
        console.error("Error fetching files:", error);
        res.status(500).json({ error: "Could not fetch files." });
    }
});

// ✅ Get Files by Category
app.get("/api/files/:category", async (req, res) => {
    try {
        const category = req.params.category;
        const files = await gridFSBucket.find({ "metadata.category": category }).toArray();
        res.json(files.map(file => ({
            filename: file.filename,
            id: file._id,
            contentType: file.metadata?.contentType || "unknown",
            category: file.metadata?.category || "Uncategorized"
        })));
    } catch (error) {
        console.error("Error fetching category files:", error);
        res.status(500).json({ error: "Could not fetch files." });
    }
});

// ✅ Delete a File
app.delete("/api/file/:id", async (req, res) => {
    try {
        const fileId = new mongoose.Types.ObjectId(req.params.id);
        await gridFSBucket.delete(fileId);
        res.json({ message: "File deleted successfully." });
    } catch (error) {
        console.error("Error deleting file:", error);
        res.status(500).json({ error: "File deletion failed." });
    }
});

// ✅ Serve File Preview
app.get("/api/file/:id", async (req, res) => {
    try {
        const fileId = new mongoose.Types.ObjectId(req.params.id);
        const downloadStream = gridFSBucket.openDownloadStream(fileId);

        downloadStream.on("error", (err) => {
            console.error("Download Error:", err);
            res.status(404).json({ error: "File not found." });
        });

        downloadStream.pipe(res);
    } catch (error) {
        console.error("Error fetching file:", error);
        res.status(500).json({ error: "Server error." });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
