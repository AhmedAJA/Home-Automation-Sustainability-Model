document.addEventListener('DOMContentLoaded', function () {
    // Only start generating notifications if the notifications area exists
    if (document.getElementById('notifications')) {
        startGeneratingNotifications();
    } else {
        console.warn("Notification area not found in the DOM");
    }
});







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

