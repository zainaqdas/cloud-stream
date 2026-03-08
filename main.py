import os
import uuid
import subprocess
import shutil
import time
import threading
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
STREAMS_DIR = "streams"
STATIC_DIR = "static"
BIN_DIR = "bin"
YTDLP_PATH = os.path.join(BIN_DIR, "yt-dlp")

os.makedirs(STREAMS_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(BIN_DIR, exist_ok=True)

# Active processes storage
active_processes = {}

class StreamRequest(BaseModel):
    url: str
    quality: Optional[str] = "best"

@app.post("/start")
async def start_stream(request: StreamRequest):
    url = request.url
    quality = request.quality

    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    stream_id = str(uuid.uuid4())
    stream_folder = os.path.join(STREAMS_DIR, stream_id)
    os.makedirs(stream_folder, exist_ok=True)
    
    m3u8_path = os.path.join(stream_folder, "index.m3u8")

    try:
        # 1. Extract direct URL using yt-dlp
        format_selector = "best"
        if quality == "720p":
            format_selector = "bestvideo[height<=720]+bestaudio/best[height<=720]"
        elif quality == "480p":
            format_selector = "bestvideo[height<=480]+bestaudio/best[height<=480]"
        elif quality == "360p":
            format_selector = "bestvideo[height<=360]+bestaudio/best[height<=360]"

        print(f"Extracting: {url} with quality {quality}")
        
        # Use the binary we downloaded in build.sh
        cmd_ytdlp = [YTDLP_PATH, "-g", "-f", format_selector, url]
        result = subprocess.run(cmd_ytdlp, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"yt-dlp error: {result.stderr}")
            
        direct_url = result.stdout.strip().split('\n')[0]
        print(f"Direct URL: {direct_url[:50]}...")

        # 2. Start FFmpeg conversion
        # -hls_flags delete_segments: auto-deletes old segments
        # -hls_list_size 6: keeps only 6 segments in the playlist
        cmd_ffmpeg = [
            "ffmpeg", "-i", direct_url,
            "-profile:v", "baseline", "-level", "3.0",
            "-start_number", "0", "-hls_time", "10", "-hls_list_size", "6",
            "-hls_flags", "delete_segments",
            "-f", "hls", m3u8_path
        ]
        
        process = subprocess.Popen(cmd_ffmpeg, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        active_processes[stream_id] = process

        return {
            "streamUrl": f"/streams/{stream_id}/index.m3u8",
            "streamId": stream_id
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        if os.path.exists(stream_folder):
            shutil.rmtree(stream_folder)
        raise HTTPException(status_code=500, detail=str(e))

# Cleanup Task
def cleanup_old_streams():
    while True:
        time.sleep(600) # Run every 10 minutes
        now = time.time()
        one_hour = 3600
        
        if not os.path.exists(STREAMS_DIR):
            continue
            
        for folder in os.listdir(STREAMS_DIR):
            folder_path = os.path.join(STREAMS_DIR, folder)
            if os.path.isdir(folder_path):
                if now - os.path.getmtime(folder_path) > one_hour:
                    print(f"Cleaning up {folder}")
                    if folder in active_processes:
                        active_processes[folder].terminate()
                        del active_processes[folder]
                    shutil.rmtree(folder_path, ignore_errors=True)

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_streams, daemon=True)
cleanup_thread.start()

# Serve static files
app.mount("/streams", StaticFiles(directory=STREAMS_DIR), name="streams")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)
