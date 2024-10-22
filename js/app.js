// app.js

// Energy Usage Line Chart
const energyCtx = document.getElementById('energyChart').getContext('2d');
const energyChart = new Chart(energyCtx, {
    type: 'line',
    data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
            label: 'Energy Usage (kWh)',
            data: [1200, 1500, 1300, 1700, 1400, 1600],
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            fill: true,
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});

// Waste Reduction Bar Chart
const wasteCtx = document.getElementById('wasteChart').getContext('2d');
const wasteChart = new Chart(wasteCtx, {
    type: 'bar',
    data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [{
            label: 'Waste Reduced (kg)',
            data: [200, 250, 230, 270],
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});

// app.js

// Simulated ChatGPT response function
function askChatGPT() {
    const userInput = document.getElementById('userInput').value;
    const chatResponse = document.getElementById('chatResponse');

    // Simulated response for now
    if (userInput.trim() === "") {
        chatResponse.innerText = "Please enter a question.";
    } else {
        chatResponse.innerText = `ChatGPT says: "Based on your home data, you can reduce your energy consumption by adjusting your thermostat to a more efficient level."`;
    }
}

// Toggle the sidebar visibility
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleBtn = document.querySelector('.toggle-btn');

    // Toggle sidebar visibility
    sidebar.classList.toggle('hidden');
    
    // Adjust the main content margin and button position
    mainContent.classList.toggle('expanded');
    toggleBtn.classList.toggle('collapsed');
}

// Array of AI-generated notifications
const notifications = [
    "Consider reducing your thermostat by 2 degrees to save 10% on your energy bill.",
    "AI suggests turning off unused devices to save up to 15% on power usage.",
    "Switch to energy-efficient LED bulbs to cut down your energy consumption by 25%.",
    "Schedule your heating system for maintenance to improve efficiency and reduce energy costs.",
    "AI recommends using smart plugs to monitor and control energy usage from your smartphone.",
    "Closing your blinds during the hottest part of the day can reduce the need for air conditioning.",
    "AI suggests upgrading your home insulation to save up to 30% on heating costs.",
    "Set timers on lights to reduce energy consumption in unoccupied rooms.",
];

// Function to generate a random notification
function generateNotification() {
    const randomNotification = notifications[Math.floor(Math.random() * notifications.length)];
    
    // Create a new notification element
    const notificationElement = document.createElement('p');
    notificationElement.innerText = randomNotification;
    notificationElement.classList.add('notification-item');

    // Add the notification to the notifications area
    const notificationArea = document.getElementById('notifications');
    notificationArea.appendChild(notificationElement);
}

// Function to generate multiple notifications on page load and periodically
function startGeneratingNotifications() {
    // Generate a few notifications at once on page load
    for (let i = 0; i < 3; i++) {
        generateNotification();
    }

    // Generate a new notification every 5 seconds
    setInterval(generateNotification, 5000);
}

// Start generating notifications when the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', startGeneratingNotifications);
