require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const cors = require("cors");
const { Readable } = require("stream");

const app = express();
app.use(express.json());

// ✅ Enable CORS
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

const PORT = process.env.PORT || 5002;
const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 5000
});

// ✅ User Schema
const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

// ✅ File Storage (GridFS)
let gridFSBucket;
mongoose.connection.once("open", () => {
    gridFSBucket = new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
    console.log("✅ GridFS Ready");
});

// ✅ Configure Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Register a New User
app.post("/api/register", [
    body("email").isEmail(),
    body("password").isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const user = new User({ email, password: hashedPassword });
        await user.save();
        res.json({ message: "✅ User registered successfully!" });
    } catch (err) {
        res.status(400).json({ error: "❌ User already exists!" });
    }
});

// ✅ User Login (Returns JWT Token)
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "❌ Invalid credentials!" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "❌ Invalid credentials!" });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
});

// ✅ Middleware to Authenticate Requests
const authenticateUser = (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) return res.status(401).json({ error: "❌ Access denied!" });

    try {
        const decoded = jwt.verify(token.replace("Bearer ", ""), JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ error: "❌ Invalid token!" });
    }
};

// ✅ Protected Route (Requires Authentication)
app.get("/api/protected", authenticateUser, (req, res) => {
    res.json({ message: "🔒 Access granted to protected content!" });
});

// ✅ File Upload (Requires Authentication)
app.post("/api/upload", authenticateUser, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "❌ No file uploaded." });

    const readableStream = new Readable();
    readableStream.push(req.file.buffer);
    readableStream.push(null);

    const uploadStream = gridFSBucket.openUploadStream(req.file.originalname, {
        metadata: { contentType: req.file.mimetype }
    });

    readableStream.pipe(uploadStream);
    uploadStream.on("finish", () => res.json({ file: { filename: req.file.originalname } }));
});

// ✅ Get All Files
app.get("/api/files", authenticateUser, async (req, res) => {
    const files = await mongoose.connection.db.collection("uploads.files").find().toArray();
    res.json(files);
});

// ✅ Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
