import express from "express";
import mysql from "mysql2/promise";
import fs from "fs";
import cors from "cors";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ================= DATABASE CONNECTION =================
// Hardcoded connection using the Railway Public URL
const connectionUri = "mysql://root:lQSSDEQRowYRoCNDZUrcmHNTduRckecl@ballast.proxy.rlwy.net:17528/railway";

const db = mysql.createPool(connectionUri);

// Quick test to confirm the connection works on startup
db.getConnection()
  .then((conn) => {
    console.log("✅ Successfully connected to Railway MySQL database!");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ Error connecting to Railway MySQL:", err.message);
  });


// ================= R2 / S3 SETUP =================
const R2_CONFIG = {
  accountId: "96a1a10ac8eb5b5ec6f47a5ea3882873",
  accessKeyId: "181e3f97ecb548d7901100e116f0edb8",
  secretAccessKey: "bd65f4f7269bb44e57a64a34a0bcc8bab06bf0ee697cd4647e5f2108e1994af8",
  bucketName: "hotels-all",
  publicUrl: "https://pub-88afeabf54f2415b9645cbc9051195e8.r2.dev",
};

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
});

const upload = multer({ storage: multer.memoryStorage() });

const uploadToR2 = async (file) => {
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: uniqueName,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3Client.send(command);
  return `${R2_CONFIG.publicUrl}/${uniqueName}`;
};


// ================= AUTH SETUP =================
const JWT_SECRET = "hardcoded_master_secret_123";

// Ensure admin_users table is properly created
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hotel_id VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'manager'
      )
    `);
    console.log("✅ admin_users table ensured in database");
  } catch (e) {
    console.error("❌ Failed to create admin_users table:", e.message);
  }
})();

// JWT Protection Middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access Denied: No token provided" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid Token. Please log in again." });
    req.user = user;
    next();
  });
};

const formatData = (val) => (typeof val === "object" ? JSON.stringify(val) : val);

// ================= AUTH APIs =================
app.post("/api/auth/register", async (req, res) => {
  try {
    const { hotel_id, name, email, password } = req.body;
    if (!hotel_id || !email || !password) {
      return res.status(400).json({ error: "hotel_id, email, password are required" });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO admin_users (hotel_id, name, email, password_hash) VALUES (?, ?, ?, ?)`,
      [hotel_id, name, email, hash],
    );
    res.json({ message: "Admin registered successfully. You can now login." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query(`SELECT * FROM admin_users WHERE email = ?`, [email]);
    const admin = rows[0];

    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: admin.id, hotel_id: admin.hotel_id, email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.json({ message: "Login successful", token, hotel_id: admin.hotel_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/admins", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, hotel_id, name, email, role FROM admin_users");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= MEDIA UPLOAD APIS =================
app.post("/api/upload/single", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const fileUrl = await uploadToR2(req.file);
    res.json({ status: "success", url: fileUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload to R2" });
  }
});

app.post("/api/upload/multiple", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded" });
    const fileUrls = await Promise.all(req.files.map(uploadToR2));
    res.json({ status: "success", urls: fileUrls });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload files to R2" });
  }
});

// ================= HOTELS APIS =================
app.post("/api/hotels", async (req, res) => {
  try {
    const keys = Object.keys(req.body);
    const values = Object.values(req.body).map(formatData);
    const sql = `INSERT INTO hotels (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
    await db.query(sql, values);
    res.json({ message: "Hotel successfully created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/hotels", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM hotels");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/hotels/:id", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM hotels WHERE hotel_id = ?", [req.params.id]);
    res.json(rows[0] || { message: "Hotel not found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/hotels/city/:city", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM hotels WHERE city = ?", [req.params.city]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/hotels/:id", authenticate, async (req, res) => {
  if (req.user.hotel_id !== req.params.id) {
    return res.status(403).json({ error: "Forbidden: You are not the admin of this hotel" });
  }
  try {
    const updates = Object.keys(req.body).map((k) => `${k} = ?`).join(",");
    const values = [...Object.values(req.body).map(formatData), req.params.id];
    await db.query(`UPDATE hotels SET ${updates} WHERE hotel_id = ?`, values);
    res.json({ message: "Hotel successfully updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/hotels/:id", authenticate, async (req, res) => {
  if (req.user.hotel_id !== req.params.id) {
    return res.status(403).json({ error: "Forbidden: You are not the admin of this hotel" });
  }
  try {
    await db.query("DELETE FROM hotels WHERE hotel_id = ?", [req.params.id]);
    res.json({ message: "Hotel successfully deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= BOOKINGS APIS =================
app.post("/api/bookings", async (req, res) => {
  try {
    const keys = Object.keys(req.body);
    const values = Object.values(req.body).map(formatData);
    const sql = `INSERT INTO bookings (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
    await db.query(sql, values);
    res.json({ message: "Booking successfully created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bookings", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM bookings");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bookings/:id", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM bookings WHERE booking_id = ?", [req.params.id]);
    res.json(rows[0] || { message: "Booking not found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bookings/hotel/:hotel_id", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM bookings WHERE hotel_id = ?", [req.params.hotel_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/bookings/:id", async (req, res) => {
  try {
    const updates = Object.keys(req.body).map((k) => `${k} = ?`).join(",");
    const values = [...Object.values(req.body).map(formatData), req.params.id];
    await db.query(`UPDATE bookings SET ${updates} WHERE booking_id = ?`, values);
    res.json({ message: "Booking successfully updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/bookings/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM bookings WHERE booking_id = ?", [req.params.id]);
    res.json({ message: "Booking successfully deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CITIES APIS =================
app.post("/api/cities", async (req, res) => {
  try {
    const keys = Object.keys(req.body);
    const values = Object.values(req.body).map(formatData);
    const sql = `INSERT INTO cities (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
    await db.query(sql, values);
    res.json({ message: "City successfully created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cities", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM cities");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cities/:city", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM cities WHERE city = ?", [req.params.city]);
    res.json(rows[0] || { message: "City not found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/cities/:city", async (req, res) => {
  try {
    const updates = Object.keys(req.body).map((k) => `${k} = ?`).join(",");
    const values = [...Object.values(req.body).map(formatData), req.params.city];
    await db.query(`UPDATE cities SET ${updates} WHERE city = ?`, values);
    res.json({ message: "City successfully updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/cities/:city", async (req, res) => {
  try {
    await db.query("DELETE FROM cities WHERE city = ?", [req.params.city]);
    res.json({ message: "City successfully deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start the server
// Note: process.env.PORT is left here because hosting services like Railway require it to inject their dynamic port.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});