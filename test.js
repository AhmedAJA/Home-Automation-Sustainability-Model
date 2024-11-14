require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = process.env.PORT || 3000;

// MySQL Database Connection Setup
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to MySQL database');
  }
});

// Route to Fetch All Room Data
app.get('/rooms', (req, res) => {
  const query = 'SELECT RoomID, RoomNumber FROM room';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching room data:', err);
      return res.status(500).json({ error: 'Error fetching room data' });
    }
    res.json(results);
  });
});

// Route to Fetch All Sensor Readings
app.get('/readings', (req, res) => {
  // const query = `
  //   SELECT r.ReadingID, r.RoomID, r.SensorID, r.Time, r.ReadingType, r.Value, rt.ReadingTypeName, rm.RoomNumber
  //   FROM reading r
  //   JOIN readingtype rt ON r.ReadingType = rt.TypeID
  //   JOIN room rm ON r.RoomID = rm.RoomID
  //   ORDER BY r.Time ASC
  // `;
  let sqlQuery = `SELECT * FROM reading`;
  db.query(sqlQuery, (err, results) => {
    if (err) {
      console.error('Error fetching sensor readings:', err);
      return res.status(500).json({ error: 'Error fetching sensor readings' });
    }
    res.json(results);
  });
});

// Route to Fetch Specific Room’s Sensor Readings by RoomID
app.get('/readings/:roomId', (req, res) => {
  const { roomId } = req.params;
  const query = `
    SELECT r.ReadingID, r.RoomID, r.SensorID, r.Time, r.ReadingType, r.Value, rt.ReadingTypeName
    FROM reading r
    JOIN readingtype rt ON r.ReadingType = rt.TypeID
    WHERE r.RoomID = ?
    ORDER BY r.Time ASC
  `;
  db.query(query, [roomId], (err, results) => {
    if (err) {
      console.error('Error fetching readings for room:', err);
      return res.status(500).json({ error: 'Error fetching readings for room' });
    }
    res.json(results);
  });
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

