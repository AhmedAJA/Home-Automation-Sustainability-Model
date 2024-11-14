document.addEventListener('DOMContentLoaded', () => {
    // Parse JSON string into an object
    const sensorData = JSON.parse(window.sensorData);
    console.log("Loaded sensorData:", sensorData);

    // Function to filter sensor data by room and type, with explicit date parsing
    function filterDataByRoomAndType(roomId, readingType) {
        const filteredData = sensorData
            .filter(data => data.RoomID == roomId && data.ReadingType === readingType)
            .map(data => ({
                x: new Date(data.Time), // Ensure each Time entry is parsed as a Date object
                y: data.Value
            }));

        console.log(`Filtered data for RoomID: ${roomId}, ReadingType: ${readingType}:`, filteredData);
        return filteredData;
    }

    // Function to create a new chart
    function createChart(canvasId, label, dataPoints) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: label,
                    data: dataPoints,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    fill: true,
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                        time: { 
                            unit: 'day',
                            tooltipFormat: 'P',
                        },
                        adapters: {
                            date: {
                                locale: 'en-US', // Explicitly set locale
                            }
                        }
                    },
                    y: { beginAtZero: true }
                },
                plugins: {
                    legend: {
                        display: true
                    }
                }
            }
        });
        console.log(`Chart created for ${label} with data:`, dataPoints);
        return chart;
    }

    // Initialize charts with data for the first room by default
    const initialRoomId = document.getElementById('roomSelect').value;
    let pirChart = createChart('pirChart', 'PIR Movement', filterDataByRoomAndType(initialRoomId, 'PIR'));
    let temperatureChart = createChart('temperatureChart', 'Temperature', filterDataByRoomAndType(initialRoomId, 'Temperature'));
    let humidityChart = createChart('humidityChart', 'Humidity', filterDataByRoomAndType(initialRoomId, 'Humidity'));
    let co2Chart = createChart('co2Chart', 'CO2 Levels', filterDataByRoomAndType(initialRoomId, 'CO2'));
    let lightChart = createChart('lightChart', 'Light Intensity', filterDataByRoomAndType(initialRoomId, 'Light'));

    // Update charts when a different room is selected
    function updateCharts() {
        const selectedRoom = document.getElementById('roomSelect').value;
        console.log("Selected Room ID:", selectedRoom);

        pirChart.data.datasets[0].data = filterDataByRoomAndType(selectedRoom, 'PIR');
        pirChart.update();

        temperatureChart.data.datasets[0].data = filterDataByRoomAndType(selectedRoom, 'Temperature');
        temperatureChart.update();

        humidityChart.data.datasets[0].data = filterDataByRoomAndType(selectedRoom, 'Humidity');
        humidityChart.update();

        co2Chart.data.datasets[0].data = filterDataByRoomAndType(selectedRoom, 'CO2');
        co2Chart.update();

        lightChart.data.datasets[0].data = filterDataByRoomAndType(selectedRoom, 'Light');
        lightChart.update();
    }

    // Attach event listener to room selector
    document.getElementById('roomSelect').addEventListener('change', updateCharts);
});
