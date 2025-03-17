require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const cors = require("cors");
const { Readable } = require("stream");
const { exec, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const User = require("../models/User");

// --- NEW: Log Model for Logging User Actions ---
const logSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, enum: ["upload", "delete"], required: true },
    fileName: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model("Log", logSchema);

// --- NEW: Helper to Extract User ID from JWT (if provided) ---
function getUserFromToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return decoded.id; // Assumes token payload includes the user id as "id"
        } catch (err) {
            console.error("JWT verification error:", err);
        }
    }
    return null;
}

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

// ✅ Ensure `uploads/` folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Load and extract reference texts
const referenceFiles = {
    invoice: path.join(__dirname, "invoice_reference.pdf"),
    patient: path.join(__dirname, "patient_reference.pdf")
};

const extractedReferences = { invoice: "", patient: "" };

function extractReferenceText(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Warning: Reference file not found: ${filePath}`);
        return "";
    }

    const pythonPath = path.join(__dirname, "../myenv/bin/python3"); // Ensure correct path
    return execSync(`${pythonPath} test/test.py "${filePath}"`).toString().trim();
}

// Extract text from both references
Object.keys(referenceFiles).forEach((key) => {
    extractedReferences[key] = extractReferenceText(referenceFiles[key]);
    console.log(`✅ Loaded ${key} Reference Text Length: ${extractedReferences[key].length}`);
});

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
        console.error("Registration Error:", error);
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

// ✅ File Upload with Auto Categorization (Logging Added)
app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }

    const tempFilePath = path.join(__dirname, "uploads", req.file.originalname);
    fs.writeFileSync(tempFilePath, req.file.buffer);

    const pythonPath = "/Users/arthurrodriguez/Desktop/CIS/myenv/bin/python3";
    exec(`${pythonPath} "test/test.py" "${tempFilePath.replace(/ /g, "\\ ")}"`, (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Error extracting text:", stderr);
            return res.status(500).json({ error: "Text extraction failed." });
        }

        const extractedText = stdout.trim();
        console.log("📄 Extracted Text:\n", extractedText);

        // ✅ Compare extracted text against both references
        const invoiceSimilarity = compareText(extractedReferences.invoice, extractedText);
        const patientSimilarity = compareText(extractedReferences.patient, extractedText);

        let category = "uncategorized";
        if (invoiceSimilarity > 0.7) {
            category = "billing";
        } else if (patientSimilarity > 0.7) {
            category = "patient";
        }

        console.log(`🔹 Similarity: Invoice(${invoiceSimilarity}), Patient(${patientSimilarity}), Assigned Category: ${category}`);

        // ✅ Store file in GridFS with metadata
        const readableStream = new Readable();
        readableStream.push(req.file.buffer);
        readableStream.push(null);

        const uploadStream = gridFSBucket.openUploadStream(req.file.originalname, {
            metadata: { contentType: req.file.mimetype, extractedText, category }
        });

        readableStream.pipe(uploadStream);

        uploadStream.on("finish", () => {
            fs.unlinkSync(tempFilePath);

            // --- NEW: Log the upload event ---
            const userId = getUserFromToken(req); // Will be null if no token provided
            const logEntry = new Log({
                user: userId,
                action: "upload",
                fileName: req.file.originalname
            });
            logEntry.save().catch((logErr) => console.error("Logging error:", logErr));

            res.json({ message: "✅ File uploaded and categorized.", category });
        });

        uploadStream.on("error", (err) => {
            console.error("Upload Error:", err);
            res.status(500).json({ error: "File upload failed." });
        });
    });
});

// ✅ Function to Compare Text Similarity
function compareText(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    return intersection.size / Math.max(words1.size, words2.size);
}

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

// ✅ Delete a File (Logging Added)
app.delete("/api/file/:id", async (req, res) => {
    try {
        const fileId = new mongoose.Types.ObjectId(req.params.id);
        // (Optional) Retrieve file info to log its name
        const files = await gridFSBucket.find({ _id: fileId }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).json({ error: "File not found." });
        }
        const fileName = files[0].filename;

        await gridFSBucket.delete(fileId);

        // --- NEW: Log the deletion event ---
        const userId = getUserFromToken(req); // Will be null if no token provided
        const logEntry = new Log({
            user: userId,
            action: "delete",
            fileName: fileName
        });
        logEntry.save().catch((logErr) => console.error("Logging error:", logErr));

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
        downloadStream.pipe(res);
    } catch (error) {
        console.error("Error fetching file:", error);
        res.status(500).json({ error: "Server error." });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
