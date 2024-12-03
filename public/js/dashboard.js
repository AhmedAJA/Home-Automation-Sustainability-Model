document.addEventListener('DOMContentLoaded', () => {
    const sensorData = window.sensorData;
    console.log("Loaded sensorData:", sensorData);

    // Helper to display all unique RoomIDs and ReadingTypes
    const uniqueRoomIDs = [...new Set(sensorData.map(data => data.RoomID))];
    const uniqueReadingTypes = [...new Set(sensorData.map(data => data.ReadingType))];
    console.log("Unique RoomIDs:", uniqueRoomIDs);
    console.log("Unique ReadingTypes:", uniqueReadingTypes);

    // Function to filter sensor data by room and type
    function filterDataByRoomAndType(roomId, readingType) {
        console.log("Filtering for RoomID:", roomId, "ReadingType:", readingType);
    
        const filteredData = sensorData.filter(data => {
            const roomMatch = String(data.RoomID) === String(roomId);
            const typeMatch = data.ReadingType.toLowerCase() === readingType.toLowerCase();
            if (roomMatch && typeMatch) {
                console.log("Match found:", data);
            }
            return roomMatch && typeMatch;
        }).map(data => ({
            x: new Date(data.Time), 
            y: data.Value
        }));
    
        console.log(`Filtered data for RoomID: ${roomId}, ReadingType: ${readingType}:`, filteredData);
        return filteredData;
    }
    

    // Function to create an ApexChart
    function createChart(chartId, seriesName, dataPoints) {
        const options = {
            chart: {
                type: 'line',
                height: 300
            },
            series: [{
                name: seriesName,
                data: dataPoints
            }],
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeFormatter: { month: 'MMM', day: 'dd' }
                }
            },
            yaxis: {
                title: {
                    text: seriesName
                }
            },
            noData: {
                text: "No Data Available"
            }
        };
        
        const chart = new ApexCharts(document.querySelector(`#${chartId}`), options);
        chart.render();
        return chart;
    }

    // Initialize charts for the first room by default
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

        pirChart.updateSeries([{ data: filterDataByRoomAndType(selectedRoom, 'PIR') }]);
        temperatureChart.updateSeries([{ data: filterDataByRoomAndType(selectedRoom, 'Temperature') }]);
        humidityChart.updateSeries([{ data: filterDataByRoomAndType(selectedRoom, 'Humidity') }]);
        co2Chart.updateSeries([{ data: filterDataByRoomAndType(selectedRoom, 'CO2') }]);
        lightChart.updateSeries([{ data: filterDataByRoomAndType(selectedRoom, 'Light') }]);
    }

    // Attach event listener to room selector
    document.getElementById('roomSelect').addEventListener('change', updateCharts);
});