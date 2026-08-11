document.addEventListener('DOMContentLoaded', () => {
    // Chart configurations & state
    const MAX_DATA_POINTS = 30;
    const timeLabels = Array(MAX_DATA_POINTS).fill('');
    const cpuData = Array(MAX_DATA_POINTS).fill(0);
    const memoryData = Array(MAX_DATA_POINTS).fill(0);

    // Chart.js default style tweaks
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Setup CPU Chart
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    const cpuGradient = cpuCtx.createLinearGradient(0, 0, 0, 160);
    cpuGradient.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
    cpuGradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    const cpuChart = new Chart(cpuCtx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'CPU %',
                data: cpuData,
                borderColor: '#38bdf8',
                borderWidth: 2,
                backgroundColor: cpuGradient,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                x: { display: false },
                y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
        }
    });

    // Setup Memory Chart
    const memCtx = document.getElementById('memoryChart').getContext('2d');
    const memGradient = memCtx.createLinearGradient(0, 0, 0, 160);
    memGradient.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
    memGradient.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

    const memoryChart = new Chart(memCtx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Memory %',
                data: memoryData,
                borderColor: '#a855f7',
                borderWidth: 2,
                backgroundColor: memGradient,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                x: { display: false },
                y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
        }
    });

    // Helper: format seconds to HH:MM:SS / Days
    function formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let result = [];
        if (days > 0) result.push(`${days}d`);
        if (hours > 0 || days > 0) result.push(`${hours}h`);
        result.push(`${mins}m ${secs}s`);
        return result.join(' ');
    }

    // Helper: format bytes
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Main fetch function
    async function fetchStats() {
        try {
            const response = await fetch('/api/stats');
            if (!response.ok) throw new Error('API network response error');
            const data = await response.json();

            // Update status indicator
            document.getElementById('statusBadge').style.borderColor = 'rgba(16, 185, 129, 0.3)';
            document.getElementById('statusText').innerText = 'ONLINE';

            // System Info
            document.getElementById('hostname').innerHTML = `<i class="fa-solid fa-laptop"></i> ${data.system.hostname}`;
            document.getElementById('osInfo').innerHTML = `<i class="fa-solid fa-microchip"></i> ${data.system.os} (${data.system.architecture})`;
            document.getElementById('uptime').innerText = formatUptime(data.system.uptime_seconds);

            // CPU Stats
            document.getElementById('cpuPercent').innerText = data.cpu.overall;
            document.getElementById('cpuCores').innerText = `${data.cpu.cores_physical || data.cpu.cores_logical} P / ${data.cpu.cores_logical} L Cores`;
            document.getElementById('cpuFreq').innerHTML = `<i class="fa-solid fa-bolt" style="color: var(--accent-amber);"></i> ${data.cpu.frequency_mhz} MHz`;
            
            const tempStr = data.cpu.temperature_c !== null ? `${data.cpu.temperature_c} °C` : '-- °C';
            document.getElementById('cpuTemp').innerHTML = `<i class="fa-solid fa-temperature-half" style="color: var(--accent-rose);"></i> ${tempStr}`;
            
            const powerStr = data.cpu.power_w !== null ? `${data.cpu.power_w} W` : '-- W';
            document.getElementById('cpuPower').innerHTML = `<i class="fa-solid fa-plug" style="color: var(--accent-emerald);"></i> ${powerStr}`;

            // Update CPU Chart
            cpuData.shift();
            cpuData.push(data.cpu.overall);
            cpuChart.update();

            // Render Per-Core Bars
            const perCoreContainer = document.getElementById('perCoreList');
            if (data.cpu.per_core && data.cpu.per_core.length > 0) {
                perCoreContainer.innerHTML = data.cpu.per_core.map((coreUsage, idx) => `
                    <div class="core-item">
                        <div class="core-header">
                            <span>Core ${idx}</span>
                            <span>${coreUsage}%</span>
                        </div>
                        <div class="core-bar-track">
                            <div class="core-bar-fill" style="width: ${coreUsage}%"></div>
                        </div>
                    </div>
                `).join('');
            }

            // Memory Stats
            document.getElementById('memoryPercent').innerText = data.memory.percent;
            document.getElementById('ramTotal').innerText = `${data.memory.total_gb} GB`;
            document.getElementById('ramUsed').innerText = `${data.memory.used_gb} GB`;
            document.getElementById('ramAvailable').innerText = `${data.memory.available_gb} GB`;

            // Swap
            document.getElementById('swapPercentText').innerText = `${data.memory.swap_percent}%`;
            document.getElementById('swapBar').style.width = `${data.memory.swap_percent}%`;
            document.getElementById('swapSubDetail').innerText = `${data.memory.swap_used_gb} GB / ${data.memory.swap_total_gb} GB`;

            // Update Memory Chart
            memoryData.shift();
            memoryData.push(data.memory.percent);
            memoryChart.update();

            // Network Stats
            document.getElementById('downloadSpeed').innerText = data.network.download_speed_kbps;
            document.getElementById('uploadSpeed').innerText = data.network.upload_speed_kbps;
            document.getElementById('netTotalRecv').innerText = formatBytes(data.network.bytes_recv);
            document.getElementById('netTotalSent').innerText = formatBytes(data.network.bytes_sent);

            // Disks
            const disksContainer = document.getElementById('disksList');
            if (data.disks && data.disks.length > 0) {
                disksContainer.innerHTML = data.disks.map(disk => `
                    <div class="disk-item">
                        <div class="disk-header">
                            <div class="disk-name">
                                <i class="fa-solid fa-database" style="color: var(--accent-amber);"></i>
                                ${disk.device}
                                <span class="disk-mount">${disk.mountpoint}</span>
                            </div>
                            <div class="disk-stats">
                                ${disk.used} GB / ${disk.total} GB (${disk.percent}%)
                            </div>
                        </div>
                        <div class="progress-bar-track">
                            <div class="progress-bar-fill disk-fill" style="width: ${disk.percent}%"></div>
                        </div>
                    </div>
                `).join('');
            } else {
                disksContainer.innerHTML = '<div class="sub-detail">No partitions available</div>';
            }

            // Processes
            const tbody = document.getElementById('processTableBody');
            if (data.top_processes && data.top_processes.length > 0) {
                tbody.innerHTML = data.top_processes.map(proc => `
                    <tr>
                        <td><code>${proc.pid}</code></td>
                        <td>${proc.name}</td>
                        <td><strong style="color: var(--accent-blue);">${proc.cpu}%</strong></td>
                        <td>${proc.memory}%</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">No process data</td></tr>';
            }

        } catch (err) {
            console.error('Fetch error:', err);
            document.getElementById('statusBadge').style.borderColor = 'rgba(244, 63, 94, 0.3)';
            document.getElementById('statusText').innerText = 'OFFLINE';
        }
    }

    // Initial fetch & loop every 1 second
    fetchStats();
    setInterval(fetchStats, 1000);
});
