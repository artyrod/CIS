require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const cors = require("cors");
const { Readable } = require("stream");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const User = require("../models/User");

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

// ✅ Load reference invoice text for categorization (if available)
const referencePDFPath = path.join(__dirname, "invoice_reference.pdf");
const extractedReferenceTextPath = path.join(__dirname, "invoice_reference.txt");

// Extract text from reference PDF if it hasn't been extracted
if (!fs.existsSync(extractedReferenceTextPath)) {
    console.log(`📂 Extracting text from reference PDF: ${referencePDFPath}`);
    const pythonPath = path.join(__dirname, "../myenv/bin/python3"); // Ensure correct Python path
    exec(`${pythonPath} test/test.py "${referencePDFPath}"`, (error, stdout, stderr) => {
    if (error) {
        console.error("❌ Error extracting reference text:", stderr);
        return;
    }

    const extractedText = stdout.trim();
    if (!extractedText) {
        console.error("❌ No text extracted from reference PDF!");
        return;
    }

    fs.writeFileSync(extractedReferenceTextPath, extractedText, "utf-8");
    console.log(`✅ Reference text extracted and saved. Length: ${extractedText.length}`);

    // Reload reference text
    invoiceReferenceText = fs.readFileSync(extractedReferenceTextPath, "utf-8");
    console.log(`📏 Loaded Reference Text Length: ${invoiceReferenceText.length}`);
});

}

// Load extracted reference text
let invoiceReferenceText = "";
if (fs.existsSync(extractedReferenceTextPath)) {
    invoiceReferenceText = fs.readFileSync(extractedReferenceTextPath, "utf-8");
    console.log(`📏 Loaded Reference Text Length: ${invoiceReferenceText.length}`);
} else {
    console.warn("⚠️ Warning: Reference text extraction failed.");
}



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

// ✅ File Upload with Auto Categorization
app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }

    // ✅ Define `safeFilePath` before using it
    const tempFilePath = path.join(__dirname, "uploads", req.file.originalname);
    const safeFilePath = path.resolve(tempFilePath); // Ensure correct file path

    // ✅ Save file temporarily for extraction
    fs.writeFileSync(safeFilePath, req.file.buffer);

    // ✅ Use the correct Python path inside `myenv`
    const pythonPath = "/Users/arthurrodriguez/Desktop/CIS/myenv/bin/python3";
    exec(`${pythonPath} "test/test.py" "${safeFilePath.replace(/ /g, "\\ ")}"`, (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Error extracting text:", stderr);
            return res.status(500).json({ error: "Text extraction failed." });
        }

        const extractedText = stdout.trim();
        console.log("📄 Extracted Text:\n", extractedText);
        console.log("📄 Reference Text:\n", invoiceReferenceText);
        console.log("📏 Extracted Text Length:", extractedText.length);
        console.log("📏 Reference Text Length:", invoiceReferenceText.length);
        console.log("📄 Extracted Text:", extractedText.substring(0, 200)); // Show first 200 chars

        // ✅ Auto-categorize based on extracted text
        const similarity = compareText(invoiceReferenceText, extractedText);
        let category = similarity > 0.7 ? "billing" : "uncategorized";

        console.log(`🔹 Similarity: ${similarity}, Assigned Category: ${category}`);

        // ✅ Store file in GridFS with metadata
        const readableStream = new Readable();
        readableStream.push(req.file.buffer);
        readableStream.push(null);

        const uploadStream = gridFSBucket.openUploadStream(req.file.originalname, {
            metadata: { contentType: req.file.mimetype, extractedText, category }
        });

        readableStream.pipe(uploadStream);

        uploadStream.on("finish", () => {
            fs.unlinkSync(safeFilePath); // ✅ Delete temp file
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
        const filesCursor = gridFSBucket.find();
        const files = await filesCursor.toArray();

        if (files.length === 0) {
            return res.status(200).json([]);  // Return empty array instead of failing
        }

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
        const filesCursor = gridFSBucket.find({ "metadata.category": category });
        const files = await filesCursor.toArray();

        if (files.length === 0) {
            return res.status(200).json([]);  // Return empty array instead of failing
        }

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
