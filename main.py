import argparse
import os
import platform
import time
from typing import Dict, Any, List

import psutil
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(title="Server Monitor API")

# Enable CORS for convenience during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Initialize psutil cpu measurement
psutil.cpu_percent(interval=None)

@app.get("/api/stats")
def get_stats() -> Dict[str, Any]:
    global last_net_io, last_net_time
    current_time = time.time()
    
    # System Info
    boot_time = psutil.boot_time()
    uptime_seconds = int(current_time - boot_time)
    
    # CPU
    cpu_overall = psutil.cpu_percent(interval=None)
    cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
    cpu_freq = psutil.cpu_freq()
    
    # Memory
    vmem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    
    # Disk Usage
    disk_partitions_info = []
    for part in psutil.disk_partitions(all=False):
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
        except PermissionError:
            continue
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

    # Top processes by CPU
    processes: List[Dict[str, Any]] = []
    for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
        try:
            info = p.info
            processes.append({
                "pid": info['pid'],
                "name": info['name'] or "Unknown",
                "cpu": round(info['cpu_percent'] or 0.0, 1),
                "memory": round(info['memory_percent'] or 0.0, 1)
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
            
    # Sort top 5 processes by CPU usage
    top_processes = sorted(processes, key=lambda x: x['cpu'], reverse=True)[:5]

    return {
        "system": {
            "hostname": platform.node(),
            "os": f"{platform.system()} {platform.release()}",
            "architecture": platform.machine(),
            "uptime_seconds": uptime_seconds,
            "boot_time": boot_time,
        },
        "cpu": {
            "overall": cpu_overall,
            "per_core": cpu_per_core,
            "cores_logical": psutil.cpu_count(logical=True),
            "cores_physical": psutil.cpu_count(logical=False),
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
