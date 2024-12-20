require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const { Configuration, OpenAIApi } = require('openai');
const bcrypt = require('bcrypt'); // For password hashing



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

const session = require('express-session');

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));


const isAuthenticated = (req, res, next) => {
  if (!req.session.userId) {
      return res.redirect('/login'); // Redirect to login if not authenticated
  }
  next();
};


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
  res.render('chat', { title: 'Chatbot Assistant' });
});

// Route to handle ChatGPT API requests with memory
app.post('/ask-chatgpt', async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
      return res.json({ response: 'Please log in to use this feature.' });
  }

  const userInput = req.body.input.trim();

  if (!userInput) {
      return res.json({ response: 'Please enter a question.' });
  }

  try {
      // Step 1: Extract RoomNumber from user's query
      const roomMatch = userInput.match(/room (\d+)/i); // Match phrases like "room 413"
      let specificRoomNumber = null;

      if (roomMatch) {
          specificRoomNumber = roomMatch[1]; // Extract RoomNumber
      }

      // Step 2: Handle logic for specific room
      let responseContext = {};
      if (specificRoomNumber) {
          // Fetch averages for 6-hour intervals using RoomNumber
          const [roomData] = await db.promise().query(
              `SELECT 
                  r.ReadingType, 
                  DATE_FORMAT(r.Time - INTERVAL MOD(HOUR(r.Time), 6) HOUR, '%Y-%m-%d %H:00:00') AS TimeBucket,
                  AVG(r.Value) AS AvgValue
               FROM reading r
               JOIN room rm ON r.RoomID = rm.RoomID
               WHERE rm.RoomNumber = ? AND rm.user_id = ?
               GROUP BY r.ReadingType, TimeBucket
               ORDER BY TimeBucket`,
              [specificRoomNumber, userId]
          );

          responseContext = {
              RoomNumber: specificRoomNumber,
              Data: roomData,
          };
      } else {
          // If no specific room is mentioned, list all available room numbers
          const [rooms] = await db.promise().query(
              'SELECT RoomNumber FROM room WHERE user_id = ?',
              [userId]
          );
          responseContext = {
              Rooms: rooms.map(room => room.RoomNumber),
          };
      }

      // Step 3: Send data and user query to GPT
      const gptResponse = await openai.createChatCompletion({
          model: 'gpt-4o',
          messages: [
              {
                  role: 'system',
                  content: `You are an intelligent assistant that helps users manage their home automation data. You will answer questions based on the provided data.`
              },
              {
                  role: 'user',
                  content: `Here is the data you can use:
                  - ${specificRoomNumber ? `Room ${specificRoomNumber}` : 'All Rooms'}: ${JSON.stringify(responseContext)}
                  
                  Question: ${userInput}`
              }
          ]
      });

      // Step 4: Extract GPT's response
      const responseMessage = gptResponse.data.choices[0].message.content.trim();

      // Send the response back to the client
      res.json({ response: responseMessage });

  } catch (error) {
      console.error('Error processing user query:', error.response?.data || error.message);
      res.status(500).json({ response: 'An error occurred while processing your query. Please try again.' });
  }
});


// Optional: Endpoint to clear the conversation history for a user
app.post('/clear-history', (req, res) => {
  const userId = req.body.userId || "default_user";
  conversationHistories[userId] = []; // Clear history for the specified user
  res.json({ message: 'Conversation history cleared.' });
});

// Dashboard Overview Route
app.get('/dashboard', isAuthenticated, async (req, res) => {
  const userId = req.session.userId; // Get the logged-in user's ID from the session

  const queries = {
    rooms: `SELECT COUNT(*) AS count FROM room WHERE user_id = ?`,
    readingTypes: `SELECT COUNT(DISTINCT ReadingType) AS count FROM reading WHERE user_id = ?`,
    readings: `SELECT COUNT(*) AS count FROM reading WHERE user_id = ?`,
    averages: `
      SELECT  
          ReadingType, 
          AVG(Value) AS avg_value 
      FROM reading 
      WHERE user_id = ? 
      GROUP BY ReadingType
    `,
    favoriteNotifications: `
      SELECT RoomNumber, AdviceText 
      FROM notifications 
      WHERE IsFavorite = 1 AND user_id = ? 
      LIMIT 10
    `,
  };

  // Helper function to query the database
  const queryDatabase = (query, params) =>
    new Promise((resolve, reject) => {
      db.query(query, params, (err, result) => (err ? reject(err) : resolve(result)));
    });

  try {
    const [
      roomCountResult,
      readingTypeCountResult,
      readingCountResult,
      averages,
      favoriteNotifications,
    ] = await Promise.all([
      queryDatabase(queries.rooms, [userId]),
      queryDatabase(queries.readingTypes, [userId]),
      queryDatabase(queries.readings, [userId]),
      queryDatabase(queries.averages, [userId]),
      queryDatabase(queries.favoriteNotifications, [userId]),
    ]);

    const roomCount = roomCountResult[0]?.count || 0;
    const readingTypeCount = readingTypeCountResult[0]?.count || 0;
    const readingCount = readingCountResult[0]?.count || 0;

    const sensorCount = roomCount * readingTypeCount;

    const averageData = averages.map(row => ({
      type: row.ReadingType,
      value: parseFloat(row.avg_value.toFixed(2)), // Format to 2 decimal places
    }));

    res.render('dashboard', {
      title: 'Dashboard Overview',
      roomCount,
      sensorCount,
      readingCount: readingCount >= 1000 ? `${(readingCount / 1000).toFixed(1)}K` : readingCount,
      readingTypeCount,
      averageData,
      favoriteNotifications,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error.message);
    res.status(500).send(`Error fetching dashboard data: ${error.message}`);
  }
});



// Rooms Data Route with Database Query
app.get('/rooms-data', (req, res) => {
  // Check if the user is logged in
  if (!req.session || !req.session.userId) {
    return res.render('login').status(401).send('Unauthorized. Please log in.');
  }

  const userId = req.session.userId; // Get the user ID from the session

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
    WHERE 
      user_id = ? 
    ORDER BY 
      Time
  `;

  const roomsQuery = `
    SELECT 
      RoomID, 
      RoomNumber 
    FROM 
      room 
    WHERE 
      user_id = ?
  `;

  db.query(roomsQuery, [userId], (err, rooms) => {
    if (err) {
      console.error('Error fetching rooms:', err);
      return res.status(500).send('Database error');
    }

    db.query(readingsQuery, [userId], (err, readings) => {
      if (err) {
        console.error('Error fetching readings:', err);
        return res.status(500).send('Database error');
      }

      // Filter rooms that have associated data
      const uniqueRoomIDsWithData = [...new Set(readings.map(data => data.RoomID))];
      const filteredRooms = rooms.filter(room => uniqueRoomIDsWithData.includes(room.RoomID));

      res.render('roomsData', {
        title: 'Rooms Data',
        rooms: filteredRooms,
        sensorData: readings
      });
    });
  });
});


app.get('/notifications', (req, res) => {
  // Check if the user is logged in
  if (!req.session || !req.session.userId) {
    return res.render('login').status(401).send('Unauthorized. Please log in.');
  }

  const userId = req.session.userId; // Get the user ID from the session
  const groupId = req.query.group || 1; // Default to GroupID 1 if none is selected

  console.log("Selected Group ID:", groupId);

  const queryGroups = `
    SELECT 
      GroupID, 
      GroupName 
    FROM 
      advice_groups 
    WHERE 
      user_id = ?
  `;

  db.query(queryGroups, [userId], (groupErr, groups) => {
    if (groupErr) {
      console.error("Error fetching advice groups:", groupErr);
      return res.status(500).send("Error fetching advice groups.");
    }

    if (groupId) {
      const queryNotifications = `
        SELECT 
          RoomNumber, 
          AdviceText 
        FROM 
          notifications 
        WHERE 
          GroupID = ? AND user_id = ?
      `;

      db.query(queryNotifications, [groupId, userId], (err, results) => {
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
    if (!req.session || !req.session.userId) {
      return res.render('login').status(401).json({ error: "Unauthorized. Please log in." });
    }

    const userId = req.session.userId;
    console.log("Fetching room data for user:", userId);

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
              WHERE r.user_id = ? 
          )
          SELECT RoomNumber, Value, ReadingType, Time
          FROM RankedData
          WHERE RowNum <= 20;
      `;

    db.query(query, [userId], async (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return res.status(500).json({ error: "Database query failed." });
      }

      if (results.length === 0) {
        console.log("No data found for advice generation.");
        return res.json({ notifications: [] });
      }

      const groupedData = results.reduce((acc, row) => {
        if (!acc[row.RoomNumber]) acc[row.RoomNumber] = [];
        acc[row.RoomNumber].push({
          Time: row.Time,
          Value: row.Value.toFixed(2),
          ReadingType: row.ReadingType,
        });
        return acc;
      }, {});

      const inputData = Object.entries(groupedData).map(([roomNumber, readings]) => ({
        RoomNumber: roomNumber,
        Readings: readings,
      }));

      console.log("Sending data to OpenAI...");

const prompt = `
You are an expert in energy and environment optimization, specializing in creative, actionable advice for 
home automation systems. Your task is to analyze the provided room sensor data and generate highly innovative, practical, and varied energy-saving recommendations.

### Objective:
Provide specific and diverse advice tailored to each room. The advice should leverage sensor readings (e.g., temperature, CO2 levels, humidity) and suggest creative actions using home automation technologies.

### REQUIRED FORMAT:
- Each recommendation must be on a separate line in this format:
  Room [RoomNumber]: "[Creative Action] at [Time] on [Date] to [Goal]."

### GUIDELINES:
1. **Creativity and Variety**:
   - Avoid generic advice like "Turn off lights" unless relevant. Incorporate creative suggestions using automation systems (e.g., smart thermostats, automated blinds, air purifiers).
   - Tailor each action to the unique conditions of the room and sensor data.

2. **Relevance to Sensor Data**:
   - Use specific sensor readings to inspire actionable insights.
   - Examples:
     - High CO2 levels → Suggest ventilation, air purifiers, or CO2 alerts.
     - High humidity → Recommend dehumidifiers or adjusting HVAC settings.
     - Temperature fluctuations → Suggest thermostat adjustments or shading.

3. **Human-Friendly Timestamps**:
   - Use natural language for times and dates (e.g., "9:30 PM on August 25, 2013").

4. **Professional Tone**:
   Each recommendation must be clear, actionable, and engaging, with a focus on achieving energy savings or improved air quality.

### EXAMPLES:
- Room 413: "Adjust the thermostat to 23°C at 6:00 PM on August 27, 2013, to maintain comfort while minimizing energy use."
- Room 415: "Open a window at 9:00 AM on August 28, 2013, to lower high CO2 levels and improve air quality."
- Room 417: "Ensure electronic devices are turned off at 6:00 PM on August 28, 2013, due to no movement detected."
- Room 421: "Dim or turn off lights at 1:00 AM on August 26, 2013, to conserve energy during low lighting needs."

### Provided Sensor Data:
${JSON.stringify(inputData)}
`;



      try {
        const response = await openai.createChatCompletion({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are an energy optimization expert." },
            { role: "user", content: prompt },
          ],
          max_tokens: 700,
          temperature: 0.9,
        });

        const rawContent = response.data.choices[0]?.message?.content || "";
        console.log("AI Raw Content:", rawContent);

        // Updated Recommendation Extraction Logic
        const recommendations = rawContent
          .split('\n') // Split content into lines
          .map(line => line.trim()) // Trim whitespace
          .filter(line => line && line.includes(':')) // Filter lines that contain ':' (to identify valid advice)
          .map(line => {
            const match = line.match(/Room (\d+|General):\s*"(.*)"/); // Match lines starting with "Room"
            if (match) {
              const [, roomNumber, adviceText] = match;
              return { roomNumber, adviceText };
            } else {
              // Handle advice without "Room" keyword
              return { roomNumber: "General", adviceText: line };
            }
          });

        console.log("Extracted Recommendations:", recommendations);

        if (recommendations.length === 0) {
          console.log("No valid recommendations extracted. Falling back...");
          const fallbackQuery = `
            SELECT RoomNumber, AdviceText 
            FROM notifications 
            WHERE user_id = ? 
            ORDER BY RAND() 
            LIMIT 20;
          `;

          const fallbackResults = await new Promise((resolve, reject) => {
            db.query(fallbackQuery, [userId], (fallbackErr, fallbackRows) => {
              if (fallbackErr) return reject(fallbackErr);
              resolve(fallbackRows);
            });
          });

          recommendations.push(...fallbackResults.map(row => ({
            roomNumber: row.RoomNumber,
            adviceText: row.AdviceText,
          })));
        }

        console.log("Saving advice group to database...");
        const now = new Date();
        const groupName = `Advice Group - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

        db.query(
          `INSERT INTO advice_groups (GroupName, user_id) VALUES (?, ?)`,
          [groupName, userId],
          (groupErr, groupResult) => {
            if (groupErr) {
              console.error("Error saving advice group:", groupErr);
              return res.status(500).json({ error: "Database error while creating advice group." });
            }

            const groupId = groupResult.insertId;

            const savePromises = recommendations.map(({ roomNumber, adviceText }) => {
              return new Promise((resolve, reject) => {
                db.query(
                  `INSERT INTO notifications (RoomNumber, AdviceText, GroupID, user_id) VALUES (?, ?, ?, ?)`,
                  [roomNumber, adviceText, groupId, userId],
                  (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                  }
                );
              });
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
  // Ensure the user is logged in
  if (!req.session || !req.session.userId) {
    return res.render('login').status(401).json({ message: 'Unauthorized. Please log in.' });
  }

  const userId = req.session.userId; // Get the logged-in user's ID

  const query = `
      SELECT RoomNumber, AdviceText, GroupID
      FROM notifications
      WHERE user_id = ? -- Only fetch data specific to the logged-in user
      LIMIT 1000; -- Fetch up to 500 rows to rank the top 10
  `;

  db.query(query, [userId], async (err, results) => {
    if (err) {
      console.error('Error fetching data from the database:', err);
      return res.status(500).json({ message: 'Database error.' });
    }

    if (results.length === 0) {
      return res.json({ topAdvice: [] }); // No advice available for the user
    }

    // Format the data for ChatGPT
    const adviceList = results.map(
      (row) => `Room ${row.RoomNumber}: "${row.AdviceText}"`
    );

    // const prompt = `
    //       You are an energy and environment optimization expert. The following is a list of energy-saving advice generated for different rooms and groups.

    //       Please rank the top 10 most valuable pieces of advice based on their potential energy-saving impact, creativity, and relevance. Provide the ranking in this format:

    //       - Room [RoomNumber]: [Simplified advice in bullet points]
    //       - remove the date from the advice

    //       Advice List:
    //       ${adviceList.join('\n')}
    //   `;

    const prompt = `
You are an energy and environment optimization expert. Your task is to rank the top 10 pieces of energy-saving advice from the provided list. The ranking should consider the following criteria:

### Ranking Criteria:
1. **Energy-Saving Impact**:
   - How effective the advice is in reducing energy consumption.
2. **Creativity**:
   - The uniqueness and innovation of the suggestion.
3. **Relevance**:
   - How well the advice aligns with typical energy-saving goals and home automation systems.

### Output Requirements:
- **Format**:
  Rank the top 10 pieces of advice in descending order of value using this format:
  - **Room [RoomNumber]: [Simplified advice in bullet points]**
- **Modification**:
  Remove any date or timestamp from the advice to make it concise.

### Example Output:
- Room 101: Adjust thermostat to 22°C during the day to maintain efficiency.
- Room 202: Use smart plugs to automatically power down idle devices.
- Room 303: Open windows when CO2 levels are high to improve air quality.

### Advice List:
${adviceList.join('\n')}
`;


    try {
      const response = await openai.createChatCompletion({
        model: 'gpt-4o',
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

  // Ensure the user is logged in
  if (!req.session || !req.session.userId) {
    return res.render('login').status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  const userId = req.session.userId; // Get the logged-in user's ID

  // Validate input
  if (!roomNumber || !groupId) {
    return res.status(400).json({ error: 'Room number and group ID are required.' });
  }

  // Restrict deletion to notifications owned by the logged-in user
  const query = `DELETE FROM notifications WHERE RoomNumber = ? AND GroupID = ? AND user_id = ?`;
  db.query(query, [roomNumber, groupId, userId], (err, result) => {
    if (err) {
      console.error("Error deleting notification:", err);
      return res.status(500).json({ error: 'Failed to delete notification.' });
    }

    // Check if a row was deleted
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found or does not belong to you.' });
    }

    res.json({ success: true });
  });
});


// Route to mark a notification as favorite
app.post('/notifications/favorite', (req, res) => {
  const { roomNumber, groupId } = req.body;

  // Ensure the user is logged in
  if (!req.session || !req.session.userId) {
    return res.render('login').status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  const userId = req.session.userId; // Get the logged-in user's ID

  // Validate input
  if (!roomNumber || !groupId) {
    return res.status(400).json({ error: 'Room number and group ID are required.' });
  }

  // Restrict the action to notifications owned by the logged-in user
  const query = `UPDATE notifications SET IsFavorite = 1 WHERE RoomNumber = ? AND GroupID = ? AND user_id = ?`;
  db.query(query, [roomNumber, groupId, userId], (err, result) => {
    if (err) {
      console.error("Error updating favorite status:", err);
      return res.status(500).json({ error: 'Failed to mark as favorite.' });
    }

    // Check if a row was updated
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found or does not belong to you.' });
    }

    res.json({ success: true });
  });
});


app.get('/login', (req, res) => {
  console.log('Login page requested');
  res.render('login', { title: 'Login - Home Automation Dashboard' });
});

app.get('/signup', (req, res) => {
  console.log('signup page requested');
  res.render('signup', { title: 'signup - Home Automation Dashboard' });
});



app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Validate user input
    if (!name || !email || !password) {
      return res.status(400).send('All fields are required.');
    }

    // Check if the email is already in use
    const emailCheckQuery = `SELECT COUNT(*) AS count FROM users WHERE email = ?`;
    db.query(emailCheckQuery, [email], async (emailCheckErr, emailCheckResult) => {
      if (emailCheckErr) {
        console.error('Error checking email:', emailCheckErr);
        return res.status(500).send('Internal server error.');
      }

      if (emailCheckResult[0].count > 0) {
        return res.status(400).send('Email is already in use.');
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert the new user into the database
      const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
      db.query(query, [name, email, hashedPassword], (err, result) => {
        if (err) {
          console.error('Error creating user:', err);
          return res.status(500).send('Error creating user.');
        }

        res.redirect('/login'); // Redirect to login after successful signup
      });
    });
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).send('Internal server error.');
  }
});


app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.redirect(`/login?error=${encodeURIComponent('Both email and password are required.')}`);
    }

    const query = `SELECT id, name, password FROM users WHERE email = ?`;
    db.query(query, [email], async (err, results) => {
      if (err) {
        console.error('Error during login query:', err);
        return res.redirect(`/login?error=${encodeURIComponent('Internal server error.')}`);
      }

      if (results.length === 0) {
        return res.redirect(`/login?error=${encodeURIComponent('Invalid email or password.')}`);
      }

      const user = results[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.redirect(`/login?error=${encodeURIComponent('Invalid email or password.')}`);
      }

      req.session.userId = user.id;
      req.session.userName = user.name;
      res.redirect('/dashboard');
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.redirect(`/login?error=${encodeURIComponent('Internal server error.')}`);
  }
});


// Contact Route
app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact Us' });
});

app.post('/contact', (req, res) => {
  const { name, email, message } = req.body;

  // Validate input
  if (!name || !email || !message) {
      return res.status(400).send('All fields are required.');
  }

  // Insert into the database
  const query = `INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)`;
  db.query(query, [name, email, message], (err, result) => {
      if (err) {
          console.error('Error saving contact message:', err);
          return res.status(500).send('Internal server error.');
      }

      console.log('Contact message saved successfully:', result);
      res.redirect('contact')
  });
});


// Handle 404 (Page Not Found)
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
