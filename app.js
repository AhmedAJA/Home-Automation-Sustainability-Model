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

// Route: Generate advice and group them
app.get('/notifications', async (req, res) => {
  const groupId = req.query.group;

  // If a group is provided in the query parameter, fetch data for that group
  if (groupId) {
      const query = `
          SELECT RoomNumber, AdviceText 
          FROM notifications 
          WHERE GroupID = ?;
      `;

      db.query(query, [groupId], (err, results) => {
          if (err) {
              console.error('Error fetching notifications:', err);
              return res.status(500).json({ error: 'Database error' });
          }

          const notifications = results.map(row => `Room ${row.RoomNumber}: "${row.AdviceText}"`);
          res.json({ notifications });
      });
  } else {
      // If no group is provided, generate new recommendations and save them to the database
      const query = `
          WITH RankedData AS (
              SELECT 
                  r.RoomID, 
                  rm.RoomNumber, 
                  r.Value, 
                  r.ReadingType, 
                  r.Time,
                  ROW_NUMBER() OVER (PARTITION BY r.RoomID ORDER BY RAND()) AS RowNum
              FROM reading r
              JOIN room rm ON r.RoomID = rm.RoomID
          )
          SELECT RoomNumber, Value, ReadingType, Time
          FROM RankedData
          WHERE RowNum <= 3; -- Limit to 3 rows per RoomID
      `;

      db.query(query, async (err, results) => {
          if (err) {
              console.error('Error fetching data from the database:', err);
              return res.status(500).send('Database error');
          }

          if (results.length === 0) {
              return res.render('notifications', {
                  title: 'Energy-Saving Notifications and AI Advice',
                  notifications: ["No recent sensor data available for generating recommendations."],
                  groups: [],
              });
          }

          // Group the readings by RoomNumber
          const groupedData = results.reduce((acc, row) => {
              if (!acc[row.RoomNumber]) acc[row.RoomNumber] = [];
              acc[row.RoomNumber].push({
                  Time: row.Time,
                  Value: row.Value.toFixed(2),
                  ReadingType: row.ReadingType,
              });
              return acc;
          }, {});

          // Prepare data for ChatGPT
          const inputData = Object.entries(groupedData).map(([roomNumber, readings]) => ({
              RoomNumber: roomNumber,
              Readings: readings,
          }));

          const prompt = `
              You are an energy and environment optimization expert. Based on the following room sensor data, generate dynamic, actionable, and diverse energy-saving recommendations.

              Avoid repeating similar advice. Be creative, considering the type of sensor readings (e.g., temperature, CO2 levels, humidity) and possible actions specific to home automation systems. Examples of actions might include:
              - Turning off lights at certain times.
              - Adjusting thermostats for efficiency.
              - Opening windows to improve air quality.
              - Turning off idle electronic devices.
              - Using smart plugs to cut energy consumption.

              The advice should be:
              - Specific to each room.
              - Based on the sensor readings provided.
              - In a professional format like this:
                Room [RoomNumber]: "[Action] at [Time] on [Date] to [Goal]."

              Data:
              ${JSON.stringify(inputData)}
          `;

          try {
              const response = await openai.createChatCompletion({
                  model: "gpt-3.5-turbo",
                  messages: [
                      { role: "system", content: "You are an energy optimization expert." },
                      { role: "user", content: prompt },
                  ],
                  max_tokens: 700,
                  temperature: 0.9,
              });

              const recommendations = response.data.choices[0].message.content
                  .split('\n')
                  .filter(line => line.trim().startsWith('Room')); // Filter room-specific recommendations

              // Save advice to the database
              const groupName = `Advice Group ${Date.now()}`;
              db.query(
                  `INSERT INTO advice_groups (GroupName) VALUES (?)`,
                  [groupName],
                  (groupErr, groupResult) => {
                      if (groupErr) {
                          console.error('Error saving advice group:', groupErr);
                          return res.status(500).send('Error saving advice group.');
                      }

                      const groupId = groupResult.insertId;

                      // Save each recommendation under this group
                      const savePromises = recommendations.map(advice => {
                          const match = advice.match(/Room (\d+): "(.*)"/);
                          if (match) {
                              const [, roomNumber, adviceText] = match;
                              return new Promise((resolve, reject) => {
                                  db.query(
                                      `INSERT INTO notifications (RoomNumber, AdviceText, GroupID) VALUES (?, ?, ?)`,
                                      [roomNumber, adviceText, groupId],
                                      (err, result) => {
                                          if (err) return reject(err);
                                          resolve(result);
                                      }
                                  );
                              });
                          }
                      });

                      Promise.all(savePromises)
                          .then(() => {
                              // Fetch all groups for dropdown
                              db.query(
                                  `SELECT GroupID, GroupName FROM advice_groups`,
                                  (groupFetchErr, groups) => {
                                      if (groupFetchErr) {
                                          console.error('Error fetching advice groups:', groupFetchErr);
                                          return res.status(500).send('Error fetching advice groups.');
                                      }

                                      res.render('notifications', {
                                          title: 'Energy-Saving Notifications and AI Advice',
                                          notifications: recommendations,
                                          groups,
                                      });
                                  }
                              );
                          })
                          .catch(saveErr => {
                              console.error('Error saving notifications:', saveErr);
                              res.status(500).send('Error saving notifications.');
                          });
                  }
              );
          } catch (error) {
              console.error('Error generating recommendations with ChatGPT:', error);
              res.status(500).send('Error generating AI advice.');
          }
      });
  }
});




// Top 10 Advice Route
app.get('/notifications/top', async (req, res) => {
  const query = `
      SELECT RoomNumber, AdviceText, GroupID
      FROM notifications
      LIMIT 500; -- Fetch up to 50 rows to rank the top 10
  `;

  db.query(query, async (err, results) => {
      if (err) {
          console.error('Error fetching data from the database:', err);
          return res.status(500).json({ message: 'Database error.' });
      }

      if (results.length === 0) {
          return res.json({ topAdvice: [] }); // No advice available
      }

      // Format the data for ChatGPT
      const adviceList = results.map(
          (row) => `Room ${row.RoomNumber}: "${row.AdviceText}"`
      );

      const prompt = `
          You are an energy and environment optimization expert. The following is a list of energy-saving advice generated for different rooms and groups.

          Please rank the top 10 most valuable pieces of advice based on their potential energy-saving impact, creativity, and relevance. Provide the ranking in this format:

          - Room [RoomNumber]: [Simplified advice in bullet points]
          - remove the date from the advice

          Advice List:
          ${adviceList.join('\n')}
      `;

      try {
          const response = await openai.createChatCompletion({
              model: 'gpt-3.5-turbo',
              messages: [
                  { role: 'system', content: 'You are an energy optimization expert.' },
                  { role: 'user', content: prompt },
              ],
              max_tokens: 700,
              temperature: 0.7,
          });

          const rankedAdvice = response.data.choices[0].message.content
              .split('\n')
              .filter((line) => line.trim().startsWith('-'))
              .map((line) => line.trim().slice(1).trim());

          res.json({ topAdvice: rankedAdvice });
      } catch (error) {
          console.error('Error generating top advice with ChatGPT:', error.response?.data || error.message);
          res.status(500).json({ message: 'Error generating top advice.' });
      }
  });
});








// Login Route
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

app.get('/signup', (req, res) => {
  res.render('signup', { title: 'Signup' });
});

app.post('/login', (req, res) => {
  // Login logic here
  res.redirect('/dashboard');
});

app.post('/signup', (req, res) => {
  // Signup logic here
  res.redirect('/login'); // Redirect back to login after signup
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
