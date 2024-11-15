require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const { Configuration, OpenAIApi } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// Set up the OpenAI API client
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// In-memory storage for conversation histories (by session or user id)
const conversationHistories = {};

// Set up the MySQL connection using environment variables
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Connected to MySQL database');
});

// Set up the view engine and the path for EJS templates
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware for serving static files (CSS, JavaScript, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Home Route
app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

// Features Route
app.get('/features', (req, res) => {
  res.render('features', { title: 'Features' });
});

// About Us Route
app.get('/about', (req, res) => {
  res.render('about', { title: 'About Us' });
});

// Chat with ChatGPT Route
app.get('/chat', (req, res) => {
  res.render('chat', { title: 'Chat with ChatGPT' });
});

// Route to handle ChatGPT API requests with memory
app.post('/ask-chatgpt', async (req, res) => {
  const userId = req.body.userId || "default_user"; // For simplicity, using a single session for now
  const userInput = req.body.input;

  // Initialize conversation history for the user if it doesn't exist
  if (!conversationHistories[userId]) {
    conversationHistories[userId] = [];
  }

  // Add user's message to conversation history
  conversationHistories[userId].push({ role: "user", content: userInput });

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: conversationHistories[userId], // Pass conversation history to OpenAI
      max_tokens: 150,
      temperature: 0.7,
    });

    const chatGPTResponse = response.data.choices[0].message.content.trim();

    // Add ChatGPT's response to the conversation history
    conversationHistories[userId].push({ role: "assistant", content: chatGPTResponse });

    res.json({ response: chatGPTResponse });
  } catch (error) {
    console.error('Error calling ChatGPT API:', error);
    res.status(500).json({ response: 'Sorry, there was an error with the ChatGPT API.' });
  }
});

// Optional: Endpoint to clear the conversation history for a user
app.post('/clear-history', (req, res) => {
  const userId = req.body.userId || "default_user";
  conversationHistories[userId] = []; // Clear history for the specified user
  res.json({ message: 'Conversation history cleared.' });
});

// Dashboard Route with Database Query
app.get('/dashboard', (req, res) => {
  const readingsQuery = `
    SELECT 
      ReadingID, 
      RoomID, 
      SensorID, 
      Time, 
      ReadingType, 
      Value 
    FROM 
      reading 
    ORDER BY 
      Time
  `;

  const roomsQuery = `SELECT RoomID, RoomNumber FROM room`;

  db.query(roomsQuery, (err, rooms) => {
    if (err) {
      console.error('Error fetching rooms:', err);
      return res.status(500).send('Database error');
    }

    db.query(readingsQuery, (err, readings) => {
      if (err) {
        console.error('Error fetching readings:', err);
        return res.status(500).send('Database error');
      }

      // Filter rooms that have associated data
      const uniqueRoomIDsWithData = [...new Set(readings.map(data => data.RoomID))];
      const filteredRooms = rooms.filter(room => uniqueRoomIDsWithData.includes(room.RoomID));

      res.render('dashboard', { 
        title: 'Dashboard', 
        rooms: filteredRooms,
        sensorData: readings
      });
    });
  });
});

// Notifications Route
app.get('/notifications', (req, res) => {
  res.render('notifications', { title: 'Notifications' });
});

// Login Route
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

// Contact Route
app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact Us' });
});

// Handle 404 (Page Not Found)
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
