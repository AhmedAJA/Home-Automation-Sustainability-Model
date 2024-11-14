require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

// Load environment variables
const port = process.env.PORT || 3000;

// Set up the view engine and the path for EJS templates
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware for serving static files (CSS, JavaScript, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse URL-encoded bodies (for form submissions)
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

// Dashboard Route
app.get('/dashboard', (req, res) => {
  res.render('dashboard', { title: 'Dashboard' });
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