# Linux Server Monitor Dashboard 🖥️

A real-time, lightweight web-based server monitoring dashboard built with Python (`FastAPI`, `psutil`) and HTML5/CSS3/JavaScript (Chart.js, Glassmorphism UI).

## Features

- ⚡ **Real-time Monitoring**: Automatically refreshes system metrics every 1 second.
- 🎨 **Modern Glassmorphism UI**: Beautiful dark mode interface with responsive layout.
- 📊 **Dynamic Charts**: Live streaming historical line charts for CPU and Memory usage.
- 💻 **Comprehensive Metrics**:
  - **CPU**: Overall & per-core usage, frequency, temperature (°C), power consumption (W).
  - **Memory**: Total, used, free RAM & Swap usage.
  - **Storage**: Storage partitions, mount points, usage %, and Disk I/O.
  - **Network**: Live Upload / Download speed meters (KB/s) and total sent/received bytes.
  - **Processes**: Top 5 CPU-consuming processes (PID, Name, CPU %, RAM %).

## Quick Start (Linux / Windows)

### 1. Clone the repository
```bash
git clone <your-repository-url>
cd servermonitor
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the Dashboard
```bash
python main.py --host 0.0.0.0 --port 8888
```

Open your browser and navigate to `http://<your-server-ip>:8888`

## Command Line Arguments

- `--host`: Host IP address to bind to (Default: `0.0.0.0`)
- `--port`: Port number to listen on (Default: `8888`)
