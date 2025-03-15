const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();  // Load .env variables into process.env

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('DB connection error:', err));

const app = express();
app.use(express.json()); // (Optional) middleware to parse JSON bodies

app.get('/test', (req, res) => {
    res.send('MongoDB connection is successful!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});