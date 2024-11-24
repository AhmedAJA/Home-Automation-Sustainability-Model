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

// Dashboard Overview Route
app.get('/dashboard', async (req, res) => {
  const queries = {
    rooms: `SELECT COUNT(*) AS count FROM room`,
    readingTypes: `SELECT COUNT(DISTINCT ReadingType) AS count FROM reading`,
    readings: `SELECT COUNT(*) AS count FROM reading`,
    averages: `
          SELECT 
              ReadingType, 
              AVG(Value) AS avg_value 
          FROM reading 
          GROUP BY ReadingType
      `
  };

  try {
    const [roomCount, readingTypeCount, readingCount, averages] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(queries.rooms, (err, result) => (err ? reject(err) : resolve(result[0].count)));
      }),
      new Promise((resolve, reject) => {
        db.query(queries.readingTypes, (err, result) => (err ? reject(err) : resolve(result[0].count)));
      }),
      new Promise((resolve, reject) => {
        db.query(queries.readings, (err, result) => (err ? reject(err) : resolve(result[0].count)));
      }),
      new Promise((resolve, reject) => {
        db.query(queries.averages, (err, result) => (err ? reject(err) : resolve(result)));
      }),
    ]);

    // Calculate the number of sensors
    const sensorCount = roomCount * readingTypeCount;

    // Process averages for frontend
    const averageData = averages.map(row => ({
      type: row.ReadingType,
      value: parseFloat(row.avg_value.toFixed(2)) // Format to 2 decimal places
    }));

    // Pass all data to the template
    res.render('dashboard', {
      title: 'Dashboard Overview',
      roomCount,
      sensorCount,
      readingCount,
      readingTypeCount,
      averageData // Pass dynamic averages to the template
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).send('Error fetching dashboard data.');
  }
});





// roomsData Route with Database Query
app.get('/rooms-data', (req, res) => {
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

      res.render('roomsData', {
        title: 'roomsData',
        rooms: filteredRooms,
        sensorData: readings
      });
    });
  });
});


app.get('/notifications', (req, res) => {
  const groupId = req.query.group || 1; // Default to GroupID 1 if none is selected

  console.log("Selected Group ID:", groupId);

  const queryGroups = `SELECT GroupID, GroupName FROM advice_groups`;
  db.query(queryGroups, (groupErr, groups) => {
    if (groupErr) {
      console.error("Error fetching advice groups:", groupErr);
      return res.status(500).send("Error fetching advice groups.");
    }

    if (groupId) {
      const queryNotifications = `
              SELECT RoomNumber, AdviceText 
              FROM notifications 
              WHERE GroupID = ?;
          `;

      db.query(queryNotifications, [groupId], (err, results) => {
        if (err) {
          console.error("Error fetching notifications:", err);
          return res.status(500).send("Database query failed.");
        }

        const notifications = results.map(row => ({
          roomNumber: row.RoomNumber,
          adviceText: row.AdviceText
      }));
      
        console.log("Fetched Notifications:", notifications);

        res.render('notifications', {
          title: 'Energy-Saving Notifications and AI Advice',
          notifications,
          groups,
          selectedGroup: parseInt(groupId, 10),
        });
      });
    } else {
      res.render('notifications', {
        title: 'Energy-Saving Notifications and AI Advice',
        notifications: [], // No notifications
        groups,
        selectedGroup: null,
      });
    }
  });
});

app.post('/notifications/generate', async (req, res) => {
  try {
    console.log("Fetching room data...");

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
        console.error("Database query error:", err);
        return res.status(500).json({ error: "Database query failed." });
      }

      if (results.length === 0) {
        console.log("No data found for advice generation.");
        return res.json({ notifications: [] });
      }

      console.log("Grouping data for OpenAI...");
      const groupedData = results.reduce((acc, row) => {
        if (!acc[row.RoomNumber]) acc[row.RoomNumber] = [];
        acc[row.RoomNumber].push({
          Time: row.Time,
          Value: row.Value.toFixed(2),
          ReadingType: row.ReadingType,
        });
        return acc;
      }, {});

      console.log("Sending data to OpenAI...");
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
              - Use human-friendly timestamps (e.g., "9:30 PM on August 25, 2013").
              - In a professional format like this:
                Room [RoomNumber]: "[Action] at [Time] to [Goal]."

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
          .filter(line => line.trim().startsWith('Room'));

        console.log("Saving advice group to database...");
         // Generate a meaningful group name with date and time
         const now = new Date();
         const formattedDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
         const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
         const groupName = `Advice Group - ${formattedDate} at ${formattedTime} (${recommendations.length} Recommendations)`;

         console.log("Saving advice group to database...");
         db.query(
             `INSERT INTO advice_groups (GroupName) VALUES (?)`,
             [groupName],
             (groupErr, groupResult) => {
                 if (groupErr) {
                     console.error("Error saving advice group:", groupErr);
                     return res.status(500).json({ error: "Database error while creating advice group." });
                 }

                 const groupId = groupResult.insertId;

                 console.log("Saving recommendations...");
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
              .then(() => res.json({ notifications: recommendations }))
              .catch(saveErr => {
                console.error("Error saving notifications:", saveErr);
                return res.status(500).json({ error: "Database error while saving notifications." });
              });
          }
        );
      } catch (openAIError) {
        console.error("OpenAI API error:", openAIError);
        return res.status(500).json({ error: "OpenAI API error. Please check your configuration." });
      }
    });
  } catch (error) {
    console.error("Unhandled error in /notifications/generate:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
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

// Route to delete a notification
app.delete('/notifications/delete', (req, res) => {
  const { roomNumber, groupId } = req.body;

  if (!roomNumber || !groupId) {
      return res.status(400).json({ error: 'Room number and group ID are required.' });
  }

  const query = `DELETE FROM notifications WHERE RoomNumber = ? AND GroupID = ?`;
  db.query(query, [roomNumber, groupId], (err) => {
      if (err) {
          console.error("Error deleting notification:", err);
          return res.status(500).json({ error: 'Failed to delete notification.' });
      }
      res.json({ success: true });
  });
});



// Route to mark a notification as favorite
app.post('/notifications/favorite', (req, res) => {
  const { roomNumber, groupId } = req.body;

  if (!roomNumber || !groupId) {
      return res.status(400).json({ error: 'Room number and group ID are required.' });
  }

  const query = `UPDATE notifications SET IsFavorite = 1 WHERE RoomNumber = ? AND GroupID = ?`;
  db.query(query, [roomNumber, groupId], (err) => {
      if (err) {
          console.error("Error updating favorite status:", err);
          return res.status(500).json({ error: 'Failed to mark as favorite.' });
      }
      res.json({ success: true });
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
