document.addEventListener('DOMContentLoaded', function () {
    // Only start generating notifications if the notifications area exists
    if (document.getElementById('notifications')) {
        startGeneratingNotifications();
    } else {
        console.warn("Notification area not found in the DOM");
    }
});

const notifications = [
    "Reduce thermostat by 2°C for 10% energy savings.",
    "Switch off unused devices to save 15% on power.",
    "Install LED bulbs to save on energy consumption.",
    "Schedule heating system maintenance to improve efficiency.",
    "Use smart plugs to control devices remotely.",
    "Close blinds during peak sun hours to reduce cooling costs.",
    "Upgrade insulation to save up to 30% on heating."
];

// Function to generate a random notification
function generateNotification() {
    const notificationArea = document.getElementById('notifications');
    
    // Check if the notifications element exists
    if (!notificationArea) {
        console.warn("Notification area not found in the DOM");
        return;
    }

    const randomNotification = notifications[Math.floor(Math.random() * notifications.length)];
    const notificationElement = document.createElement('p');
    notificationElement.innerText = randomNotification;
    notificationElement.classList.add('notification-item');
    
    notificationArea.appendChild(notificationElement);
}

// Function to generate multiple notifications on load and periodically
function startGeneratingNotifications() {
    // Generate a few notifications on page load
    for (let i = 0; i < 5; i++) {
        generateNotification();
    }

    // Generate a new notification every 5 seconds
    
}

// Toggle sidebar visibility
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleBtn = document.querySelector('.toggle-btn');

    sidebar.classList.toggle('hidden');

    if (sidebar.classList.contains('hidden')) {
        mainContent.style.marginLeft = '0';
        toggleBtn.style.left = '20px';
    } else {
        mainContent.style.marginLeft = '250px';
        toggleBtn.style.left = '270px';
    }
}
