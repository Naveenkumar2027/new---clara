
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';

// --- Helper functions for Audio Encoding/Decoding ---

function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data, ctx, sampleRate, numChannels) {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
}


// --- React Components ---

const RobotIcon = ({size = 24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" fillOpacity="0.3"></path>
        <path d="M12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm-2 13.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm-4-5.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z M12 6c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3z" fill="currentColor"></path>
    </svg>
);
const UserIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
);
const VolumeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>
);
const PencilIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg>
);
const CollegeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"></path></svg>
);
const StaffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
);
const VideoIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"></path></svg>
);


const App = () => {
    const [messages, setMessages] = useState([]);
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('Ready to chat');
    
    const sessionPromiseRef = useRef(null);
    const inputAudioContextRef = useRef(null);
    const outputAudioContextRef = useRef(null);
    const scriptProcessorRef = useRef(null);
    const mediaStreamSourceRef = useRef(null);
    const streamRef = useRef(null);
    const sourcesRef = useRef(new Set());
    const nextStartTimeRef = useRef(0);
    const chatContainerRef = useRef(null);

    // Load chat history from sessionStorage
    useEffect(() => {
        try {
            const savedMessages = sessionStorage.getItem('clara-chat-history');
            if (savedMessages) {
                setMessages(JSON.parse(savedMessages));
            } else {
                 setMessages([{ sender: 'clara', text: "Hi there! I'm Clara, your friendly AI receptionist! 😊 I'm so excited to help you today! Feel free to ask me anything - I'm here to assist you with whatever you need!", isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) }]);
            }
        } catch (error) {
            console.error("Failed to load messages from session storage", error);
        }
    }, []);

    // Save chat history to sessionStorage
    useEffect(() => {
        try {
            sessionStorage.setItem('clara-chat-history', JSON.stringify(messages));
        } catch (error) {
            console.error("Failed to save messages to session storage", error);
        }
    }, [messages]);

    // Auto-scroll chat
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const stopRecording = useCallback(() => {
        if (isRecording) {
            console.log("Stopping recording...");
            setIsRecording(false);
            setStatus('Ready to chat');

            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            if (scriptProcessorRef.current) {
                scriptProcessorRef.current.disconnect();
                scriptProcessorRef.current = null;
            }
            if (mediaStreamSourceRef.current) {
                mediaStreamSourceRef.current.disconnect();
                mediaStreamSourceRef.current = null;
            }
            if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
                inputAudioContextRef.current.close();
            }
            if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
                outputAudioContextRef.current.close();
            }

            if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                    console.log("Closing session.");
                    session.close();
                });
                sessionPromiseRef.current = null;
            }
        }
    }, [isRecording]);


    const handleMicClick = async () => {
        if (isRecording) {
            stopRecording();
            return;
        }
        
        setIsRecording(true);
        setStatus('Connecting...');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                    },
                    systemInstruction: "You are Clara, a friendly and helpful AI receptionist. You can converse in multiple languages, including Indian languages mixed with English. Keep your responses conversational and concise.",
                },
                callbacks: {
                    onopen: async () => {
                        console.log('Session opened.');
                        setStatus('Listening...');
                        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                        mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
                        scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        
                        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: async (message) => {
                        const timestamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
                        // Handle transcription
                        const inputTranscription = message.serverContent?.inputTranscription;
                        const outputTranscription = message.serverContent?.outputTranscription;

                        if (inputTranscription) {
                            setMessages(prev => {
                                const last = prev[prev.length - 1];
                                if (last?.sender === 'user' && !last.isFinal) {
                                    return [...prev.slice(0, -1), { ...last, text: inputTranscription.text }];
                                }
                                return [...prev, { sender: 'user', text: inputTranscription.text, isFinal: false, timestamp }];
                            });
                        }

                        if (outputTranscription) {
                             setMessages(prev => {
                                const last = prev[prev.length - 1];
                                if (last?.sender === 'clara' && !last.isFinal) {
                                    return [...prev.slice(0, -1), { ...last, text: outputTranscription.text }];
                                }
                                return [...prev, { sender: 'clara', text: outputTranscription.text, isFinal: false, timestamp }];
                            });
                        }

                        if (message.serverContent?.turnComplete) {
                            setMessages(prev => prev.map(msg => ({...msg, isFinal: true })));
                        }

                        // Handle audio playback
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                        if (base64Audio) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
                            const source = outputAudioContextRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContextRef.current.destination);
                            
                            source.addEventListener('ended', () => {
                                sourcesRef.current.delete(source);
                            });

                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }

                         const interrupted = message.serverContent?.interrupted;
                         if (interrupted) {
                             for (const source of sourcesRef.current.values()) {
                                 source.stop();
                                 sourcesRef.current.delete(source);
                             }
                             nextStartTimeRef.current = 0;
                         }

                    },
                    onerror: (e) => {
                        console.error('Session error:', e);
                        setStatus('Error. Please try again.');
                        stopRecording();
                    },
                    onclose: () => {
                        console.log('Session closed.');
                         if(isRecording) { // only if not closed by user action
                             stopRecording();
                         }
                    },
                },
            });
        } catch (error) {
            console.error('Failed to start recording:', error);
            setStatus('Mic setup failed. Please allow permissions.');
            setIsRecording(false);
        }
    };
    
    return (
        <>
            <style>{`
                :root {
                    --page-bg: #6A5ACD; /* A nice purple */
                    --app-bg: #F3F4F6; /* Light gray */
                    --header-bg: #FFFFFF;
                    --input-bg: #FFFFFF;

                    --clara-bubble-bg: #5D5FEF;
                    --clara-bubble-text: #FFFFFF;
                    --user-bubble-bg: #FFFFFF;
                    --user-bubble-text: #1F2937;
                    
                    --text-primary: #111827;
                    --text-secondary: #6B7280;
                    --clara-header-text: #5D5FEF;
                    
                    --status-green: #10B981;
                    --mic-idle: #F59E0B; /* Amber/Orange */
                    --mic-recording: #EF4444; /* Red */
                }
                body {
                    font-family: 'Noto Sans', sans-serif;
                    margin: 0;
                    background-color: var(--page-bg);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    color: var(--text-primary);
                }
                .app-wrapper {
                    width: 100%;
                    height: 100%;
                    max-width: 1200px;
                    max-height: 800px;
                    display: flex;
                    flex-direction: column;
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                    background-color: var(--app-bg);
                }
                .app-header {
                    background-color: var(--header-bg);
                    padding: 1rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #E5E7EB;
                    flex-shrink: 0;
                }
                .header-left, .header-right {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                .header-left {
                    color: var(--clara-header-text);
                    font-weight: 700;
                    font-size: 1.5rem;
                    gap: 0.75rem;
                }
                .header-button {
                    background-color: #F3F4F6;
                    border: none;
                    border-radius: 999px;
                    padding: 0.5rem 1rem;
                    font-size: 0.875rem;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                .header-button:hover { background-color: #E5E7EB; }
                .header-button.green { color: #059669; }
                .header-button.blue { color: #2563EB; }
                .header-button.red { color: #DC2626; }

                .status-indicator { display: flex; align-items: center; gap: 0.5rem; color: var(--status-green); font-weight: 500; font-size: 0.875rem; }
                .status-indicator .dot { width: 8px; height: 8px; background-color: var(--status-green); border-radius: 50%; }

                .chat-area {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .chat-window {
                    flex: 1;
                    padding: 1.5rem 2rem;
                    overflow-y: auto;
                }
                .message-wrapper { display: flex; flex-direction: column; margin-bottom: 1rem; }
                .message-wrapper.clara { align-items: flex-start; }
                .message-wrapper.user { align-items: flex-end; }
                .message { display: flex; max-width: 75%; align-items: flex-end; gap: 0.75rem;}
                .message.user { flex-direction: row-reverse; }

                .message-icon { color: var(--text-secondary); flex-shrink: 0; }
                .message-content {
                    padding: 0.75rem 1.25rem;
                    border-radius: 18px;
                    line-height: 1.5;
                    font-size: 0.95rem;
                }
                .message.clara .message-content {
                    background-color: var(--clara-bubble-bg);
                    color: var(--clara-bubble-text);
                    border-bottom-left-radius: 4px;
                }
                .message.user .message-content {
                    background-color: var(--user-bubble-bg);
                    color: var(--user-bubble-text);
                    border-bottom-right-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .message-timestamp {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    margin-top: 0.5rem;
                    padding: 0 0.5rem;
                }
                .message-wrapper.user .message-timestamp { text-align: right; }
                
                .typing-indicator span {
                    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
                    background-color: var(--clara-bubble-text); opacity: 0.7;
                    animation: typing 1.2s infinite;
                }
                .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
                .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
                @keyframes typing {
                    0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); }
                }

                .input-area {
                    padding: 1rem 2rem;
                    background-color: var(--input-bg);
                    border-top: 1px solid #E5E7EB;
                }
                .input-content {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                .mic-button {
                    width: 64px; height: 64px;
                    border-radius: 50%; border: none; cursor: pointer;
                    display: flex; justify-content: center; align-items: center;
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                }
                .mic-button.idle { background-color: var(--mic-idle); color: white; }
                .mic-button.recording { background-color: var(--mic-recording); color: white; box-shadow: 0 0 0 6px var(--mic-recording-glow, rgba(239, 68, 68, 0.4)); }
                .mic-button svg { width: 30px; height: 30px; }
                
                .input-text-area p { color: var(--text-primary); font-weight: 500; margin: 0 0 0.5rem; }
                .input-footer { display: flex; align-items: center; gap: 1.5rem; color: #9E9E9E; font-size: 0.8rem; }
                .input-footer div { display: flex; align-items: center; gap: 0.3rem; }
                .input-footer div:first-child svg { color: var(--clara-header-text); }
                .input-footer div:last-child svg { color: var(--mic-idle); }
            `}</style>
            <div className="app-wrapper">
                <header className="app-header">
                    <div className="header-left">
                        <RobotIcon size={32} />
                        <h1>Clara</h1>
                    </div>
                    <div className="header-right">
                        <button className="header-button green"><CollegeIcon /> College Demo</button>
                        <button className="header-button blue"><StaffIcon /> Staff Login</button>
                        <button className="header-button red"><VideoIcon /> Video Call</button>
                        <div className="status-indicator">
                            <span className="dot"></span>
                            <span>Ready to chat</span>
                        </div>
                    </div>
                </header>
                <main className="chat-area">
                    <div className="chat-window" ref={chatContainerRef}>
                        {messages.map((msg, index) => (
                            <div key={index} className={`message-wrapper ${msg.sender}`}>
                                <div className={`message ${msg.sender}`}>
                                    {msg.sender === 'clara' && <div className="message-icon"><RobotIcon /></div>}
                                    <div className="message-content">
                                        {msg.text || (msg.sender === 'clara' && (
                                            <div className="typing-indicator"><span></span><span></span><span></span></div>
                                        ))}
                                    </div>
                                    {msg.sender === 'user' && <div className="message-icon"><UserIcon /></div>}
                                </div>
                                {msg.isFinal && msg.timestamp && <div className="message-timestamp">{msg.timestamp}</div>}
                            </div>
                        ))}
                    </div>
                    <div className="input-area">
                        <div className="input-content">
                             <button 
                                className={`mic-button ${isRecording ? 'recording' : 'idle'}`}
                                onClick={handleMicClick}
                                aria-label={isRecording ? "Stop recording" : "Start recording"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"></path></svg>
                            </button>
                            <div className="input-text-area">
                                <p>{isRecording ? status : 'Click the microphone to speak'}</p>
                                <div className="input-footer">
                                    <div><VolumeIcon /><p>Clara voice enabled</p></div>
                                    <div><PencilIcon /><p>Text cleaning enabled</p></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
