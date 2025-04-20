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
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587 with STARTTLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendFailedUploadEmail(userEmail, fileName, errorMessage) {
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || "no-reply@example.com",
            to: userEmail,
            subject: `Failed Upload Notification for ${fileName}`,
            text: `Hello,

Your file upload for "${fileName}" failed due to the following error:

${errorMessage}

Please check your file and try again.

Regards,
FilePilot Solutions`
        });
        console.log(`Email sent to ${userEmail} regarding failed upload of ${fileName}.`);
    } catch (err) {
        console.error("Error sending failed upload email:", err);
    }
}


// Import User model (adjust path as necessary)
const User = require("../models/User");

// --- Log Model for Logging User Actions ---
// Added errorMessage field for capturing failure reasons.
const logSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, enum: ["upload", "delete", "rename"], required: true },
    fileName: { type: String, required: true },
    status: { type: String, enum: ["success", "failed"], default: "success" },
    errorMessage: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model("Log", logSchema);

// --- Scheduled Upload Model ---
const scheduledUploadSchema = new mongoose.Schema({
    fileBuffer: { type: Buffer, required: true },
    originalname: { type: String, required: true },
    mimetype: { type: String, required: true },
    category: { type: String, default: "uncategorized" },
    scheduledTime: { type: Date, required: true }
});
const ScheduledUpload = mongoose.model("ScheduledUpload", scheduledUploadSchema);

// --- Helper to Extract User ID from JWT ---
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
const REGISTER_CODE = process.env.REGISTER_CODE || "543214"; // Registration code

// --- MongoDB Connection ---
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

// --- Multer Setup ---
const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- Ensure uploads folder exists ---
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// --- Load and Extract Reference Texts ---
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
    // Adjust the python path as needed
    const pythonPath = path.join(__dirname, "../myenv/bin/python3");
    return execSync(`${pythonPath} test/test.py "${filePath}"`).toString().trim();
}

Object.keys(referenceFiles).forEach((key) => {
    extractedReferences[key] = extractReferenceText(referenceFiles[key]);
    console.log(`✅ Loaded ${key} Reference Text Length: ${extractedReferences[key].length}`);
});

// --- Registration Endpoint ---
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

// --- Login Endpoint ---
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials." });
    }
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
});

// --- File Upload Endpoint (Batching & Scheduled Upload) ---
app.post("/api/upload", upload.array("files"), (req, res) => {
    console.log("Upload endpoint hit. Received files:", req.files);
    const { scheduledTime, category } = req.body;

    // Debug logs for scheduledTime
    console.log("Received scheduledTime:", scheduledTime);
    const parsedScheduledTime = scheduledTime ? new Date(scheduledTime) : null;
    console.log("Parsed scheduledTime:", parsedScheduledTime);
    console.log("Current server time:", new Date());

    // Determine if processing should happen immediately
    const processImmediately = !scheduledTime || parsedScheduledTime <= new Date();
    console.log("processImmediately:", processImmediately);

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No file uploaded." });
    }

    // Separate valid PDF files from invalid files.
    let validFiles = [];
    let invalidFiles = [];
    req.files.forEach(file => {
        console.log("Processing file:", file.originalname, "MIME:", file.mimetype);
        const isPDF = (file.mimetype === "application/pdf") || file.originalname.toLowerCase().endsWith(".pdf");

        if (!isPDF) {
            console.log("Invalid file detected:", file.originalname);  // Debug log

            invalidFiles.push(file);
            const userId = getUserFromToken(req);
            console.log("User ID from token:", userId); // Debug log

            const failedLog = new Log({
                user: userId,
                action: "upload",
                fileName: file.originalname,
                status: "failed",
                errorMessage: "Invalid file type. Only PDF files are accepted."
            });
            failedLog.save()
                .then(() => console.log("Failed upload logged for file:", file.originalname))
                .catch(err => console.error("Error logging failed upload:", err));

            // Send email notification if possible
            if (userId) {
                User.findById(userId)
                    .then(user => {
                        if (user && user.email) {
                            console.log("Attempting to send email to:", user.email);
                            sendFailedUploadEmail(
                                user.email,
                                file.originalname,
                                "Invalid file type. Only PDF files are accepted."
                            );
                        } else {
                            console.log("User not found or missing email for userId:", userId);
                        }
                    })
                    .catch(err => console.error("Error fetching user for email:", err));
            } else {
                console.log("No valid user token found; email will not be sent.");
            }
        } else {
            console.log("Valid PDF file detected:", file.originalname);
            validFiles.push(file);
        }
    });

    if (!processImmediately) {
        // Save each valid file for scheduled processing
        validFiles.forEach(file => {
            const scheduledUpload = new ScheduledUpload({
                fileBuffer: file.buffer,
                originalname: file.originalname,
                mimetype: file.mimetype,
                category: category || "uncategorized",
                scheduledTime: parsedScheduledTime
            });
            scheduledUpload.save().catch((err) => console.error("Error saving scheduled upload:", err));
        });
        return res.json({
            message: `✅ Files scheduled for upload. ${invalidFiles.length} file(s) invalid and logged as failed.`
        });
    }

    // Process valid files immediately
    validFiles.forEach(file => {
        // Write file temporarily to disk
        const tempFilePath = path.join(__dirname, "uploads", file.originalname);
        fs.writeFileSync(tempFilePath, file.buffer);

        // Adjust the python path as needed
        const pythonPath = "/Users/arthurrodriguez/Desktop/CIS/myenv/bin/python3";
        exec(`${pythonPath} "test/test.py" "${tempFilePath.replace(/ /g, "\\ ")}"`, (error, stdout, stderr) => {
            if (error) {
                console.error("❌ Error extracting text:", stderr);
                const userId = getUserFromToken(req);
                const failedLog = new Log({
                    user: userId,
                    action: "upload",
                    fileName: file.originalname,
                    status: "failed",
                    errorMessage: "Error extracting text: " + stderr
                });
                failedLog.save().catch(err => console.error("Error logging failed upload:", err));

                // Send email notification if possible
                if (userId) {
                    User.findById(userId).then(user => {
                        if (user && user.email) {
                            sendFailedUploadEmail(
                                user.email,
                                file.originalname,
                                "Error extracting text: " + stderr
                            );
                        }
                    }).catch(err => console.error("Error fetching user for email:", err));
                }
                return; // Skip further processing for this file.
            }

            const extractedText = stdout.trim();
            console.log("📄 Extracted Text for", file.originalname, ":\n", extractedText);

            // Compare extracted text with reference texts
            const invoiceSimilarity = compareText(extractedReferences.invoice, extractedText);
            const patientSimilarity = compareText(extractedReferences.patient, extractedText);

            let fileCategory = "uncategorized";
            if (invoiceSimilarity > 0.7) {
                fileCategory = "billing";
            } else if (patientSimilarity > 0.7) {
                fileCategory = "patient";
            }

            // Override category if provided by the request (and not "all")
            if (category && category !== "all") {
                fileCategory = category;
            }

            console.log(`🔹 File: ${file.originalname} - Invoice Sim: ${invoiceSimilarity}, Patient Sim: ${patientSimilarity}, Assigned: ${fileCategory}`);

            // Create a readable stream from the file buffer and upload to GridFS
            const readableStream = new Readable();
            readableStream.push(file.buffer);
            readableStream.push(null);

            const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
                metadata: { contentType: file.mimetype, extractedText, category: fileCategory }
            });

            readableStream.pipe(uploadStream);

            uploadStream.on("finish", () => {
                fs.unlinkSync(tempFilePath);
                const userId = getUserFromToken(req);
                const logEntry = new Log({
                    user: userId,
                    action: "upload",
                    fileName: file.originalname,
                    status: "success"
                });
                logEntry.save().catch((logErr) => console.error("Logging error:", logErr));
            });

            uploadStream.on("error", (err) => {
                console.error("Upload Error:", err);
            });
        });
    });
    return res.json({
        message: `✅ Files uploaded successfully!`
    });
});

// --- Utility: Compare Text Similarity ---
function compareText(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    return intersection.size / Math.max(words1.size, words2.size);
}

// --- Endpoint to Log a Failed Upload (if needed from client) ---
app.post("/api/failed-upload", async (req, res) => {
    const userId = getUserFromToken(req);
    const { fileName, errorMessage } = req.body;
    if (!fileName || !errorMessage) {
        return res.status(400).json({ error: "File name and error message are required." });
    }
    try {
        // Create and save the failure log.
        const failedLog = new Log({
            user: userId,
            action: "upload",
            fileName,
            status: "failed",
            errorMessage
        });
        await failedLog.save();
        console.log("Failed upload logged for file:", fileName);

        // Also send an email notification.
        if (userId) {
            const user = await User.findById(userId);
            if (user && user.email) {
                console.log("Attempting to send failed upload email to:", user.email);
                // Note: This function is defined in server.js.
                sendFailedUploadEmail(user.email, fileName, errorMessage);
            } else {
                console.log("User not found or email missing for userId:", userId);
            }
        } else {
            console.log("No valid user token found; email will not be sent.");
        }

        res.json({ message: "Failed upload logged." });
    } catch (error) {
        console.error("Error logging failed upload:", error);
        res.status(500).json({ error: "Failed to log failed upload." });
    }
});

// --- Endpoint to Retrieve Failed Uploads ---
app.get("/api/failed-uploads", async (req, res) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const failedLogs = await Log.find({ user: userId, status: "failed", action: "upload" }).sort({ timestamp: -1 });
        res.json(failedLogs);
    } catch (error) {
        console.error("Error fetching failed uploads:", error);
        res.status(500).json({ error: "Failed to fetch failed uploads." });
    }
});

// --- Get All Uploaded Files ---
app.get("/api/files", async (req, res) => {
    try {
        const files = await gridFSBucket.find().toArray();
        res.json(files.map(file => ({
            filename: file.filename,
            id: file._id,
            contentType: file.metadata?.contentType || "unknown",
            category: file.metadata?.category || "Uncategorized",
            uploadDate: file.uploadDate
        })));
    } catch (error) {
        console.error("Error fetching files:", error);
        res.status(500).json({ error: "Could not fetch files." });
    }
});

// --- Get Files by Category ---
app.get("/api/files/:category", async (req, res) => {
    try {
        const category = req.params.category;
        const files = await gridFSBucket.find({ "metadata.category": category }).toArray();
        res.json(files.map(file => ({
            filename: file.filename,
            id: file._id,
            contentType: file.metadata?.contentType || "unknown",
            category: file.metadata?.category || "Uncategorized",
            uploadDate: file.uploadDate
        })));
    } catch (error) {
        console.error("Error fetching category files:", error);
        res.status(500).json({ error: "Could not fetch files." });
    }
});

// --- Delete a File ---
app.delete("/api/file/:id", async (req, res) => {
    try {
        const fileId = new mongoose.Types.ObjectId(req.params.id);
        const files = await gridFSBucket.find({ _id: fileId }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).json({ error: "File not found." });
        }
        const fileName = files[0].filename;
        await gridFSBucket.delete(fileId);
        const userId = getUserFromToken(req);
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

const { ObjectId } = require("mongodb");

// --- Rename Endpoint for GridFS ---
app.put("/api/rename/:id", async (req, res) => {
    try {
        const fileId = new ObjectId(req.params.id);
        const { newFilename } = req.body;
        if (!newFilename) {
            return res.status(400).json({ error: "New filename is required." });
        }
        // Update the file document in GridFS files collection
        const result = await mongoose.connection.db
            .collection("uploads.files")
            .updateOne({ _id: fileId }, { $set: { filename: newFilename } });

        if (result.modifiedCount === 1) {
            // Log the rename event
            const logEntry = new Log({
                user: getUserFromToken(req),
                action: "rename",
                fileName: newFilename,
                status: "success"
            });
            logEntry.save().catch(err => console.error("Logging error:", err));

            return res.json({ message: "File renamed successfully." });
        } else {
            return res.status(400).json({ error: "File not found or not updated." });
        }
    } catch (error) {
        console.error("Rename error:", error);
        res.status(500).json({ error: "Error renaming file." });
    }
});

// ----- Password Reset Endpoint -----
app.post("/api/reset-password", async (req, res) => {
    try {
        const userId = getUserFromToken(req);
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: "Both old and new passwords are required." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Old password is incorrect." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        return res.json({ message: "Password updated successfully." });
    } catch (error) {
        console.error("Reset password error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

// ----- Audit Logs Endpoint -----
app.get("/api/audit", async (req, res) => {
    try {
        const userId = getUserFromToken(req);
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const logs = await Log.find()
            .populate("user", "email")
            .sort({ timestamp: -1 });

        const auditData = logs.map(log => ({
            fileName: log.fileName,
            action: log.action,
            timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : null,
            user: log.user ? log.user.email : "Unknown",
            status: log.status,
            errorMessage: log.errorMessage
        }));

        res.json(auditData);
    } catch (error) {
        console.error("Audit log retrieval error:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

// --- Serve File Preview ---
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

// --- Delete Failed Upload Endpoint ---
app.delete("/api/failed-upload/:id", async (req, res) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        // Delete a log record that has status "failed", action "upload", and belongs to the user.
        const result = await Log.deleteOne({
            _id: req.params.id,
            user: userId,
            action: "upload",
            status: "failed"
        });
        if (result.deletedCount === 1) {
            res.json({ message: "Failed upload record removed." });
        } else {
            res.status(404).json({ error: "Record not found." });
        }
    } catch (error) {
        console.error("Error deleting failed upload record:", error);
        res.status(500).json({ error: "Failed to delete record." });
    }
});


// --- Scheduler to Process Scheduled Uploads ---
setInterval(async () => {
    try {
        const now = new Date();
        const dueUploads = await ScheduledUpload.find({ scheduledTime: { $lte: now } });
        if (dueUploads.length) {
            console.log(`Processing ${dueUploads.length} scheduled uploads...`);
            dueUploads.forEach(upload => {
                const tempFilePath = path.join(__dirname, "uploads", upload.originalname);
                fs.writeFileSync(tempFilePath, upload.fileBuffer);

                const pythonPath = "/Users/arthurrodriguez/Desktop/CIS/myenv/bin/python3";
                exec(`${pythonPath} "test/test.py" "${tempFilePath.replace(/ /g, "\\ ")}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error("❌ Error extracting text for scheduled upload:", stderr);
                        return;
                    }

                    const extractedText = stdout.trim();
                    const invoiceSimilarity = compareText(extractedReferences.invoice, extractedText);
                    const patientSimilarity = compareText(extractedReferences.patient, extractedText);

                    let fileCategory = upload.category;
                    if (invoiceSimilarity > 0.7) {
                        fileCategory = "billing";
                    } else if (patientSimilarity > 0.7) {
                        fileCategory = "patient";
                    }

                    const readableStream = new Readable();
                    readableStream.push(upload.fileBuffer);
                    readableStream.push(null);

                    const uploadStream = gridFSBucket.openUploadStream(upload.originalname, {
                        metadata: { contentType: upload.mimetype, extractedText, category: fileCategory }
                    });

                    readableStream.pipe(uploadStream);

                    uploadStream.on("finish", () => {
                        fs.unlinkSync(tempFilePath);
                        ScheduledUpload.deleteOne({ _id: upload._id })
                            .catch(err => console.error("Error removing scheduled upload:", err));
                    });

                    uploadStream.on("error", (err) => {
                        console.error("Upload Error (scheduled):", err);
                    });
                });
            });
        }
    } catch (error) {
        console.error("Error processing scheduled uploads:", error);
    }
}, 60000); // Checks every minute

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
