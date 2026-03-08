import React, { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { Play, Loader2, Video, Settings, Trash2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('best');
  const [loading, setLoading] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const startStream = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setStreamUrl(null);

    try {
      const response = await fetch('/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, quality }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setStreamUrl(data.streamUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to start stream');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (streamUrl && videoRef.current) {
      const video = videoRef.current;

      if (Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(e => console.log("Auto-play blocked", e));
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log("Network error, trying to recover...");
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log("Media error, trying to recover...");
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play();
        });
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [streamUrl]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Video className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">CloudStreamer</h1>
              <p className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold opacity-80">Personal Media Cloud</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-white/40">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              System Online
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-[1fr_380px] gap-12">
          {/* Left Column: Player */}
          <div className="space-y-6">
            <div className="aspect-video bg-black rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative group">
              <AnimatePresence mode="wait">
                {!streamUrl && !loading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center text-white/20"
                  >
                    <Video size={64} strokeWidth={1} className="mb-4" />
                    <p className="text-sm font-medium">Enter a URL to start streaming</p>
                  </motion.div>
                )}
                {loading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10"
                  >
                    <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                    <p className="text-emerald-500 font-bold tracking-widest uppercase text-[10px]">Extracting Stream...</p>
                    <p className="text-white/40 text-xs mt-2">This may take a few seconds</p>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <video 
                ref={videoRef}
                controls
                className={`w-full h-full object-contain ${!streamUrl ? 'hidden' : 'block'}`}
                poster="https://picsum.photos/seed/stream/1280/720?blur=10"
              />
            </div>

            {streamUrl && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-medium text-white/80">Live Stream Active</span>
                </div>
                <button 
                  onClick={() => setStreamUrl(null)}
                  className="text-xs font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Stop Session
                </button>
              </motion.div>
            )}
          </div>

          {/* Right Column: Controls */}
          <div className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                <Settings size={14} />
                Stream Configuration
              </h2>
              
              <div className="space-y-4 p-6 bg-white/5 rounded-3xl border border-white/5">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-white/40 ml-1">Video Source URL</label>
                  <input 
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="YouTube, Twitch, Vimeo..."
                    className="w-full bg-black border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-white/10"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-white/40 ml-1">Output Quality</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['best', '720p', '480p', '360p'].map((q) => (
                      <button
                        key={q}
                        onClick={() => setQuality(q)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-tighter transition-all ${
                          quality === q 
                            ? 'bg-emerald-500 text-black' 
                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={startStream}
                  disabled={loading || !url}
                  className="w-full bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <Play size={20} fill="currentColor" />
                      Initialize Stream
                    </>
                  )}
                </button>

                {error && (
                  <p className="text-red-400 text-[10px] font-bold uppercase text-center mt-2">{error}</p>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Quick Info</h2>
              <div className="p-6 bg-white/5 rounded-3xl border border-white/5 space-y-4 text-xs text-white/60 leading-relaxed">
                <p>• Streams are converted to HLS on-the-fly for low latency playback.</p>
                <p>• Temporary files are automatically purged after 1 hour of inactivity.</p>
                <p>• Supports 1000+ sites via integrated yt-dlp core.</p>
                <div className="pt-2 border-t border-white/5">
                  <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" className="flex items-center gap-2 text-emerald-500 hover:underline">
                    Supported Sites <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/5 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/20 font-bold">
          CloudStreamer Engine v1.0.0 &copy; 2024
        </p>
      </footer>
    </div>
  );
}
