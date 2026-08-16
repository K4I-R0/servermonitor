import argparse
import os
import platform
import time
import threading
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

import psutil
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Global cache & lock for server metrics
latest_stats: Dict[str, Any] = {}
stats_lock = threading.Lock()
collector_thread: Optional[threading.Thread] = None
is_running = True

HISTORY_FILE = "storage_history.json"

def update_storage_history(usage_percent: float, used_gb: float, total_gb: float) -> List[Dict[str, Any]]:
    try:
        history = []
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r") as f:
                history = json.load(f)
        
        today_str = datetime.now().strftime("%Y-%m-%d")
        
        if history and history[-1]["date"] == today_str:
            history[-1] = {"date": today_str, "percent": usage_percent, "used_gb": used_gb, "total_gb": total_gb}
        else:
            history.append({"date": today_str, "percent": usage_percent, "used_gb": used_gb, "total_gb": total_gb})
            
        if len(history) > 30:
            history = history[-30:]
            
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f)
            
        return history
    except Exception as e:
        print(f"[WARN] Error updating storage history: {e}")
        return []

# Helper function to convert bytes to human readable format
def bytes_to_gb(b: int) -> float:
    return round(b / (1024 ** 3), 2)

def bytes_to_mb(b: int) -> float:
    return round(b / (1024 ** 2), 2)

# Global store for previous network and CPU energy calculation
last_net_io = None
last_net_time = None
last_energy_uj = None
last_energy_time = None

def get_cpu_power():
    global last_energy_uj, last_energy_time
    try:
        with open("/sys/class/powercap/intel-rapl/intel-rapl:0/energy_uj", "r") as f:
            energy_uj = int(f.read().strip())
        
        current_time = time.time()
        power_w = None
        if last_energy_uj is not None and last_energy_time is not None:
            time_delta = current_time - last_energy_time
            if time_delta > 0:
                power_w = ((energy_uj - last_energy_uj) / 1_000_000) / time_delta
                
        last_energy_uj = energy_uj
        last_energy_time = current_time
        return round(power_w, 2) if power_w is not None else 0.0
    except Exception:
        return None

def get_cpu_temperature():
    if not hasattr(psutil, "sensors_temperatures"):
        return None
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return None
        # Try common sensor names
        for name in ['coretemp', 'k10temp', 'cpu_thermal']:
            if name in temps and temps[name]:
                return round(temps[name][0].current, 1)
        # Fallback to the first available sensor
        for name, entries in temps.items():
            if entries:
                return round(entries[0].current, 1)
    except Exception:
        pass
    return None

def collect_metrics_loop():
    """Background thread to collect system metrics periodically without blocking requests."""
    global last_net_io, last_net_time, latest_stats, is_running
    
    # Initialize CPU measurement counters
    psutil.cpu_percent(interval=None)
    psutil.cpu_percent(interval=None, percpu=True)
    
    # Static system information
    boot_time = psutil.boot_time()
    hostname = platform.node()
    os_info = f"{platform.system()} {platform.release()}"
    architecture = platform.machine()
    cores_logical = psutil.cpu_count(logical=True)
    cores_physical = psutil.cpu_count(logical=False)
    
    tick_count = 0
    top_processes: List[Dict[str, Any]] = []
    
    while is_running:
        try:
            # Measure overall CPU percent over 3.0s interval (this also sleeps 3.0s)
            cpu_overall = psutil.cpu_percent(interval=3.0)
            cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
            cpu_freq = psutil.cpu_freq()
            current_time = time.time()
            uptime_seconds = int(current_time - boot_time)
            
            # Memory
            vmem = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            # Disk Usage
            disk_partitions_info = []
            storage_history_data = []
            
            is_windows = platform.system() == "Windows"
            system_drive = os.environ.get("SystemDrive", "C:") + "\\" if is_windows else "/"

            for part in psutil.disk_partitions(all=False):
                if part.mountpoint != system_drive:
                    continue
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    disk_partitions_info.append({
                        "device": part.device,
                        "mountpoint": part.mountpoint,
                        "fstype": part.fstype,
                        "total": bytes_to_gb(usage.total),
                        "used": bytes_to_gb(usage.used),
                        "free": bytes_to_gb(usage.free),
                        "percent": usage.percent,
                    })
                    storage_history_data = update_storage_history(usage.percent, bytes_to_gb(usage.used), bytes_to_gb(usage.total))
                except Exception:
                    continue

            # Disk I/O
            try:
                disk_io = psutil.disk_io_counters()
                disk_io_data = {
                    "read_bytes": disk_io.read_bytes if disk_io else 0,
                    "write_bytes": disk_io.write_bytes if disk_io else 0,
                }
            except Exception:
                disk_io_data = {"read_bytes": 0, "write_bytes": 0}

            # Network I/O & Speed calculation
            net_io = psutil.net_io_counters()
            upload_speed = 0.0
            download_speed = 0.0
            
            if last_net_io and last_net_time:
                time_delta = current_time - last_net_time
                if time_delta > 0:
                    upload_speed = max(0, (net_io.bytes_sent - last_net_io.bytes_sent) / time_delta)
                    download_speed = max(0, (net_io.bytes_recv - last_net_io.bytes_recv) / time_delta)

            last_net_io = net_io
            last_net_time = current_time

            # Update top processes every loop (3 seconds)
            processes: List[Dict[str, Any]] = []
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
                try:
                    info = p.info
                    # Skip System Idle Process (PID 0) on Windows to avoid skewing top process list
                    if info['pid'] == 0:
                        continue
                    # Convert per-core percent to overall percent
                    overall_cpu = (info['cpu_percent'] or 0.0) / cores_logical
                    processes.append({
                        "pid": info['pid'],
                        "name": info['name'] or "Unknown",
                        "cpu": round(overall_cpu, 1),
                        "memory": round(info['memory_percent'] or 0.0, 1)
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
            top_processes = sorted(processes, key=lambda x: x['cpu'], reverse=True)[:5]

            now_dt = datetime.now()
            server_time_str = now_dt.strftime("%Y/%m/%d %H:%M:%S")

            # Construct stats snapshot
            snapshot = {
                "system": {
                    "hostname": hostname,
                    "os": os_info,
                    "architecture": architecture,
                    "uptime_seconds": uptime_seconds,
                    "boot_time": boot_time,
                    "server_time": server_time_str,
                    "current_timestamp": current_time,
                },
                "cpu": {
                    "overall": cpu_overall,
                    "per_core": cpu_per_core,
                    "cores_logical": cores_logical,
                    "cores_physical": cores_physical,
                    "frequency_mhz": round(cpu_freq.current, 1) if cpu_freq else 0,
                    "temperature_c": get_cpu_temperature(),
                    "power_w": get_cpu_power(),
                },
                "memory": {
                    "total_gb": bytes_to_gb(vmem.total),
                    "used_gb": bytes_to_gb(vmem.used),
                    "available_gb": bytes_to_gb(vmem.available),
                    "percent": vmem.percent,
                    "swap_total_gb": bytes_to_gb(swap.total),
                    "swap_used_gb": bytes_to_gb(swap.used),
                    "swap_percent": swap.percent,
                },
                "disks": disk_partitions_info,
                "disk_io": disk_io_data,
                "network": {
                    "bytes_sent": net_io.bytes_sent,
                    "bytes_recv": net_io.bytes_recv,
                    "upload_speed_kbps": round(upload_speed / 1024, 1),
                    "download_speed_kbps": round(download_speed / 1024, 1),
                },
                "top_processes": top_processes,
                "storage_history": storage_history_data,
            }

            with stats_lock:
                latest_stats = snapshot
                
        except Exception as e:
            print(f"[WARN] Error in metrics collector loop: {e}")
            time.sleep(3.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global collector_thread, is_running
    is_running = True
    collector_thread = threading.Thread(target=collect_metrics_loop, daemon=True)
    collector_thread.start()
    yield
    is_running = False

app = FastAPI(title="Server Monitor API", lifespan=lifespan)

# Enable CORS for convenience during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/stats")
def get_stats() -> Dict[str, Any]:
    with stats_lock:
        if latest_stats:
            return latest_stats
    from datetime import datetime
    now_dt = datetime.now()
    return {
        "system": {
            "hostname": platform.node(),
            "os": f"{platform.system()} {platform.release()}",
            "architecture": platform.machine(),
            "uptime_seconds": 0,
            "boot_time": time.time(),
            "server_time": now_dt.strftime("%Y/%m/%d %H:%M:%S"),
            "current_timestamp": time.time(),
        },
        "cpu": {"overall": 0, "per_core": [], "cores_logical": psutil.cpu_count(logical=True), "cores_physical": psutil.cpu_count(logical=False), "frequency_mhz": 0, "temperature_c": None, "power_w": None},
        "memory": {"total_gb": 0, "used_gb": 0, "available_gb": 0, "percent": 0, "swap_total_gb": 0, "swap_used_gb": 0, "swap_percent": 0},
        "disks": [],
        "disk_io": {"read_bytes": 0, "write_bytes": 0},
        "network": {"bytes_sent": 0, "bytes_recv": 0, "upload_speed_kbps": 0, "download_speed_kbps": 0},
        "top_processes": [],
        "storage_history": []
    }

# Serve static directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def read_root():
    return FileResponse(os.path.join(static_dir, "index.html"))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Server Monitor Dashboard")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host IP to bind to")
    parser.add_argument("--port", type=int, default=8888, help="Port to listen on")
    args = parser.parse_args()

    print(f"[INFO] Starting Server Monitor on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)

