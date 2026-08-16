document.addEventListener('DOMContentLoaded', () => {
    // Chart configurations & state
    const MAX_DATA_POINTS = 30;
    const timeLabels = Array(MAX_DATA_POINTS).fill('');
    const cpuData = Array(MAX_DATA_POINTS).fill(0);
    const memoryData = Array(MAX_DATA_POINTS).fill(0);

    // Chart.js default style tweaks
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";

    const commonChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#f1f5f9',
                bodyColor: '#cbd5e1',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 8,
                displayColors: false,
            }
        },
        scales: {
            x: {
                display: false
            },
            y: {
                min: 0,
                max: 100,
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                    drawBorder: false
                },
                ticks: {
                    color: '#64748b',
                    font: { size: 10 },
                    stepSize: 25,
                    callback: function(value) {
                        return value + '%';
                    }
                }
            }
        }
    };

    // Setup CPU Chart
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    const cpuGradient = cpuCtx.createLinearGradient(0, 0, 0, 160);
    cpuGradient.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
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
        options: commonChartOptions
    });

    // Setup Memory Chart
    const memCtx = document.getElementById('memoryChart').getContext('2d');
    const memGradient = memCtx.createLinearGradient(0, 0, 0, 160);
    memGradient.addColorStop(0, 'rgba(168, 85, 247, 0.45)');
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
        options: commonChartOptions
    });

    // Setup Storage Chart
    const storageCtx = document.getElementById('storageChart').getContext('2d');
    const storageGradient = storageCtx.createLinearGradient(0, 0, 0, 160);
    storageGradient.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
    storageGradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

    const storageChart = new Chart(storageCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Storage %',
                data: [],
                borderColor: '#f59e0b',
                borderWidth: 2,
                backgroundColor: storageGradient,
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5,
            }]
        },
        options: {
            ...commonChartOptions,
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 10 } }
                },
                y: {
                    ...commonChartOptions.scales.y,
                    suggestedMin: 0,
                    suggestedMax: 100
                }
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

            // Server Time & System Info
            document.getElementById('serverTime').innerText = data.system.server_time || '--';
            document.getElementById('hostname').innerHTML = `<i class="fa-solid fa-laptop"></i> ${data.system.hostname}`;
            document.getElementById('osInfo').innerHTML = `<i class="fa-solid fa-microchip"></i> ${data.system.os} (${data.system.architecture})`;
            document.getElementById('uptime').innerText = formatUptime(data.system.uptime_seconds);

            // CPU Stats
            document.getElementById('cpuPercent').innerText = data.cpu.overall;
            const physCores = data.cpu.cores_physical || Math.floor(data.cpu.cores_logical / 2);
            const logicalThreads = data.cpu.cores_logical;
            document.getElementById('cpuCores').innerText = `${physCores} Cores / ${logicalThreads} Threads`;
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
                                <span>${disk.device}</span>
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
                disksContainer.innerHTML = '<div class="sub-detail" style="text-align: center; padding: 12px;">No partitions available</div>';
            }

            // Update Storage Chart (History)
            if (data.storage_history && data.storage_history.length > 0) {
                // Parse date strings to simpler format (e.g., MM/DD)
                const storageLabels = data.storage_history.map(item => {
                    const parts = item.date.split('-');
                    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : item.date;
                });
                const storagePercents = data.storage_history.map(item => item.percent);

                storageChart.data.labels = storageLabels;
                storageChart.data.datasets[0].data = storagePercents;
                storageChart.update();
            }

            // Processes
            const tbody = document.getElementById('processTableBody');
            if (data.top_processes && data.top_processes.length > 0) {
                tbody.innerHTML = data.top_processes.map(proc => `
                    <tr>
                        <td><code>${proc.pid}</code></td>
                        <td class="proc-name-cell" title="${proc.name}">${proc.name}</td>
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

    // Initial fetch & loop every 3 seconds
    fetchStats();
    setInterval(fetchStats, 3000);
});

