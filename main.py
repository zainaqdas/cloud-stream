import os
import uuid
import subprocess
import time
import shutil
import threading
import shutil # To find ffmpeg path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STREAMS_DIR = "streams"
os.makedirs(STREAMS_DIR, exist_ok=True)

class StreamRequest(BaseModel):
    url: str
    quality: str = "720"

# --- HELPER TO FIND FFMPEG ---
def get_ffmpeg_path():
    # Try to find ffmpeg in the system path
    path = shutil.which("ffmpeg")
    if path:
        return path
    # Common Railway/Nixpacks paths if which fails
    possible_paths = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/bin/ffmpeg"]
    for p in possible_paths:
        if os.path.exists(p):
            return p
    return "ffmpeg" # Fallback to string and hope for the best

FFMPEG_BIN = get_ffmpeg_path()
print(f"--- SYSTEM INFO: FFMPEG located at: {FFMPEG_BIN} ---")

def cleanup_old_streams():
    while True:
        try:
            now = time.time()
            for folder in os.listdir(STREAMS_DIR):
                folder_path = os.path.join(STREAMS_DIR, folder)
                if os.path.isdir(folder_path):
                    if now - os.path.getmtime(folder_path) > 3600:
                        shutil.rmtree(folder_path)
        except: pass
        time.sleep(600)

threading.Thread(target=cleanup_old_streams, daemon=True).start()

@app.post("/start")
async def start_stream(req: StreamRequest):
    stream_id = str(uuid.uuid4())
    output_dir = os.path.join(STREAMS_DIR, stream_id)
    os.makedirs(output_dir, exist_ok=True)
    m3u8_path = os.path.join(output_dir, "playlist.m3u8")

    video_url = req.url
    is_direct_link = any(ext in req.url.lower() for ext in [".mp4", ".m4v", ".mkv", ".mov", ".avi"])

    try:
        if not is_direct_link:
            ydl_opts = {
                'format': f'bestvideo[height<={req.quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<={req.quality}]',
                'quiet': True,
                'no_warnings': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(req.url, download=False)
                video_url = info.get('url')

        ffmpeg_cmd = [
            FFMPEG_BIN, # Use the path we found
            "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
            "-i", video_url,
            "-c", "copy", 
            "-start_number", "0",
            "-hls_time", "6",
            "-hls_list_size", "10",
            "-hls_flags", "delete_segments",
            "-f", "hls", m3u8_path
        ]

        subprocess.Popen(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        for i in range(25): # Slightly longer wait for slow links
            if os.path.exists(m3u8_path):
                return {"stream_id": stream_id, "playlist_url": f"/streams/{stream_id}/playlist.m3u8"}
            time.sleep(1)

        raise Exception("FFmpeg timed out. Check if the link is valid and accessible.")

    except Exception as e:
        if os.path.exists(output_dir): shutil.rmtree(output_dir)
        raise HTTPException(status_code=400, detail=str(e))

app.mount("/streams", StaticFiles(directory=STREAMS_DIR), name="streams")
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
