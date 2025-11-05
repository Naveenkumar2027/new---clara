import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob, FunctionDeclaration, Type } from '@google/genai';

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


// --- React Components & Icons ---

const MicOnIcon = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
);
const MicOffIcon = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
);
const CameraOnIcon = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"></path></svg>
);
const CameraOffIcon = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4 4V7h-6.18l2 2H16v.92l4 4V6.5zm-1.12 9.38L18.8 15.3l-4-4V7H8.8l-2-2H16c.55 0 1 .45 1 1v3.5l4 4zm-16-1.59l1.41-1.41 1.47 1.47-1.41 1.41-1.47-1.47zM4.41 6.41L3 4.99 4.41 3.58 3 2.17l1.41-1.41 18 18-1.41 1.41-2.92-2.92H4c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h.41l-1.59-1.59z"></path></svg>
);
const RobotIcon = ({size = 24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M20 12h-2V9c0-1.1-.9-2-2-2h-1c-.55 0-1 .45-1 1s.45 1 1 1h1v2H8V9h1c.55 0 1-.45 1-1s-.45-1-1-1H8c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v1c0 .55.45 1 1 1s1-.45 1-1v-1h10v1c0 .55.45 1 1 1s1-.45 1-1v-1h1c1.1 0 2-.9 2-2v-2c0-1.1-.9-2-2-2zm-4.5 3h-7c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h7c.28 0 .5.22.5.5s-.22.5-.5.5zM15 11H9V9h6v2z"></path></svg>
);
const UserIcon = ({size = 24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
);
const GraduationCapIcon = ({size=16}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm0 8.47L4.5 8 12 5l7.5 3L12 11.47zM10.5 13.5v3.45c0 1.15.39 2.18 1.05 2.94.66.77 1.63 1.21 2.7 1.21 1.76 0 3.25-1.49 3.25-3.32V13.5h-1.5v3.28c0 .99-.6 1.82-1.75 1.82-.92 0-1.75-.83-1.75-1.82V13.5h-2.5z"></path></svg>
);
const StaffLoginIcon = ({size=16}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
);
const VideoCallHeaderIcon = ({size=16}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"></path></svg>
);
const SpeakerIcon = ({size=20}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>
);
const PencilIcon = ({size=20}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg>
);


const staffList = [
    { name: 'Prof. Lakshmi Durga N', shortName: 'LDN' },
    { name: 'Prof. Anitha C S', shortName: 'ACS' },
    { name: 'Dr. G Dhivyasri', shortName: 'GD' },
    { name: 'Prof. Nisha S K', shortName: 'NSK' },
    { name: 'Prof. Amarnath B Patil', shortName: 'ABP' },
    { name: 'Dr. Nagashree N', shortName: 'NN' },
    { name: 'Prof. Anil Kumar K V', shortName: 'AKV' },
    { name: 'Prof. Jyoti Kumari', shortName: 'JK' },
    { name: 'Prof. Vidyashree R', shortName: 'VR' },
    { name: 'Dr. Bhavana A', shortName: 'BA' },
    { name: 'Prof. Bhavya T N', shortName: 'BTN' },
];

const initiateVideoCallFunction: FunctionDeclaration = {
    name: 'initiateVideoCall',
    description: 'Initiates a video call with a specific staff member.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            staffShortName: {
                type: Type.STRING,
                description: 'The short name (e.g., "ACS", "LDN") of the staff member to call.',
            },
        },
        required: ['staffShortName'],
    },
};

const PreChatModal = ({ onStart }) => {
    const [details, setDetails] = useState({
        name: '',
        phone: '+91',
        purpose: '',
        staffShortName: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (details.name.trim() && details.purpose.trim()) {
            onStart(details);
        } else {
            alert('Please fill in your name and purpose.');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <RobotIcon size={28} />
                    <h1>Start Conversation with Clara</h1>
                </div>
                <p>Please provide your details below to begin.</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-field">
                        <label htmlFor="name">Name</label>
                        <input type="text" id="name" name="name" value={details.name} onChange={handleChange} required />
                    </div>
                    <div className="form-field">
                        <label htmlFor="phone">Phone Number</label>
                        <input type="tel" id="phone" name="phone" value={details.phone} onChange={handleChange} />
                    </div>
                    <div className="form-field">
                         <label htmlFor="purpose">Purpose</label>
                         <textarea id="purpose" name="purpose" value={details.purpose} onChange={handleChange} required />
                    </div>
                    <div className="form-field">
                        <label htmlFor="staff">Connect with (Optional)</label>
                        <select id="staff" name="staffShortName" value={details.staffShortName} onChange={handleChange}>
                            <option value="">Select a staff member...</option>
                            {staffList.map(staff => (
                                <option key={staff.shortName} value={staff.shortName}>
                                    {staff.name} ({staff.shortName})
                                </option>
                            ))}
                        </select>
                    </div>
                    <button type="submit">Start Chatting</button>
                </form>
            </div>
        </div>
    );
};

const VideoCallView = ({ staff, onEndCall }) => {
    const userVideoRef = useRef(null);
    const streamRef = useRef(null);
    const animationFrameRef = useRef(null);
    const audioContextRef = useRef(null);

    const [countdown, setCountdown] = useState(3);
    const [isConnected, setIsConnected] = useState(false);
    const [isUserSpeaking, setIsUserSpeaking] = useState(false);
    const [isStaffSpeaking, setIsStaffSpeaking] = useState(false);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCameraOn, setIsCameraOn] = useState(true);

    // Countdown effect
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            setIsConnected(true);
        }
    }, [countdown]);
    
    // Simulated staff speaking effect
    useEffect(() => {
        if (!isConnected) return;
        const interval = setInterval(() => {
            setIsStaffSpeaking(prev => Math.random() > 0.5 ? !prev : prev);
        }, 1200);
        return () => clearInterval(interval);
    }, [isConnected]);

    useEffect(() => {
        const startCameraAndAudio = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                streamRef.current = stream;
                if (userVideoRef.current) {
                    userVideoRef.current.srcObject = stream;
                }

                // Setup audio analysis for speaker detection
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioContext;
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;
                source.connect(analyser);

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                const checkSpeaking = () => {
                    analyser.getByteTimeDomainData(dataArray);
                    let sum = 0;
                    for (const amplitude of dataArray) {
                        sum += Math.pow(amplitude / 128 - 1, 2);
                    }
                    const volume = Math.sqrt(sum / dataArray.length);
                    const SPEAKING_THRESHOLD = 0.02;
                    
                    const audioTrack = streamRef.current?.getAudioTracks()[0];
                    if (audioTrack?.enabled) {
                        setIsUserSpeaking(volume > SPEAKING_THRESHOLD);
                    } else {
                        setIsUserSpeaking(false);
                    }
                    animationFrameRef.current = requestAnimationFrame(checkSpeaking);
                };
                checkSpeaking();

            } catch (err) {
                console.error("Error accessing camera/mic:", err);
                alert("Could not access your camera or microphone. Please check permissions and try again.");
                onEndCall();
            }
        };

        startCameraAndAudio();

        return () => {
            cancelAnimationFrame(animationFrameRef.current);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(console.error);
            }
        };
    }, [onEndCall]);

    const toggleMic = () => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMicOn(audioTrack.enabled);
            }
        }
    };
    
    const toggleCamera = () => {
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOn(videoTrack.enabled);
            }
        }
    };

    return (
        <div className="video-call-container">
             {countdown > 0 && (
                <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                </div>
            )}
            <div className="staff-video-view">
                <div className={`staff-avatar-placeholder ${isStaffSpeaking && isConnected ? 'speaking' : ''}`}>
                    <StaffLoginIcon size={80} />
                </div>
                <h2>{staff.name}</h2>
                <p>{isConnected ? 'Connected' : 'Connecting...'}</p>
                 <div className="video-call-branding">
                    <RobotIcon size={20} /> Clara Video
                </div>
            </div>
            <div className={`user-video-view ${isUserSpeaking ? 'speaking' : ''}`}>
                 {isCameraOn ? (
                    <video ref={userVideoRef} autoPlay playsInline muted></video>
                ) : (
                    <div className="user-video-placeholder">
                        <UserIcon size={48} />
                    </div>
                )}
            </div>
            <div className="video-controls">
                <button className={`control-button ${!isMicOn ? 'off' : ''}`} onClick={toggleMic} aria-label={isMicOn ? 'Mute microphone' : 'Unmute microphone'}>
                    {isMicOn ? <MicOnIcon size={24}/> : <MicOffIcon size={24}/>}
                </button>
                <button className={`control-button ${!isCameraOn ? 'off' : ''}`} onClick={toggleCamera} aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}>
                     {isCameraOn ? <CameraOnIcon size={24}/> : <CameraOffIcon size={24}/>}
                </button>
                <button className="end-call-button" onClick={onEndCall}>
                    End Call
                </button>
            </div>
        </div>
    );
};


const App = () => {
    const [messages, setMessages] = useState([]);
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('Click the microphone to speak');
    const [showPreChatModal, setShowPreChatModal] = useState(true);
    const [preChatDetails, setPreChatDetails] = useState(null);
    const [view, setView] = useState('chat'); // 'chat', 'video_call'
    const [videoCallTarget, setVideoCallTarget] = useState(null);
    
    const sessionPromiseRef = useRef(null);
    const inputAudioContextRef = useRef(null);
    const outputAudioContextRef = useRef(null);
    const scriptProcessorRef = useRef(null);
    const mediaStreamSourceRef = useRef(null);
    const streamRef = useRef(null);
    const sourcesRef = useRef(new Set());
    const nextStartTimeRef = useRef(0);
    const chatContainerRef = useRef(null);
    const silenceStartRef = useRef(null);
    const isRecordingRef = useRef(false);

    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

    useEffect(() => {
        try {
            const savedDetails = sessionStorage.getItem('clara-prechat-details');
            if (savedDetails) {
                setPreChatDetails(JSON.parse(savedDetails));
                setShowPreChatModal(false);
            }
            const savedMessages = sessionStorage.getItem('clara-chat-history');
            if (savedMessages) {
                setMessages(JSON.parse(savedMessages));
            } else {
                 setMessages([{ sender: 'clara', text: "Hi there! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! Feel free to ask me anything - I'm here to assist with whatever you need!", isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            }
        } catch (error) {
            console.error("Failed to load from session storage", error);
        }
    }, []);

    useEffect(() => {
        try {
            if (preChatDetails) {
                sessionStorage.setItem('clara-prechat-details', JSON.stringify(preChatDetails));
            }
            if (messages.length > 0) {
              sessionStorage.setItem('clara-chat-history', JSON.stringify(messages));
            }
        } catch (error) {
            console.error("Failed to save to session storage", error);
        }
    }, [preChatDetails, messages]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const handleStartConversation = (details) => {
        setPreChatDetails(details);
        setShowPreChatModal(false);
        const welcomeText = details.name ? `Hi ${details.name}! I'm Clara, your friendly AI receptionist! How can I assist you today?` : "Hi there! I'm Clara, your friendly AI receptionist! How can I assist you today?";
        setMessages([{ sender: 'clara', text: welcomeText, isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    };
    
    const stopRecording = useCallback((closeSession = true) => {
        if (!isRecordingRef.current) return; // Prevent multiple stops
        
        isRecordingRef.current = false;
        setIsRecording(false);

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
            inputAudioContextRef.current.close().catch(console.error);
            inputAudioContextRef.current = null;
        }
        
        silenceStartRef.current = null;
        
        if (closeSession && sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close()).catch(console.error);
            sessionPromiseRef.current = null;
        }
    }, []);

    const handleEndCall = () => {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages(prev => [...prev, { sender: 'clara', text: `Video call with ${videoCallTarget.name} ended.`, isFinal: true, timestamp }]);
        setView('chat');
        setVideoCallTarget(null);
    };

    const handleMicClick = async () => {
        if (isRecordingRef.current) {
            stopRecording(false);
            setStatus('Processing...');
            return;
        }
        
        isRecordingRef.current = true;
        setIsRecording(true);
        setStatus('Listening...');

        try {
            if (!sessionPromiseRef.current) {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                
                if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
                    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                }
                const outputNode = outputAudioContextRef.current.createGain();
                outputNode.connect(outputAudioContextRef.current.destination);

                const { name, purpose, staffShortName } = preChatDetails;
                const selectedStaff = staffList.find(s => s.shortName === staffShortName);
                const staffHint = selectedStaff ? `${selectedStaff.name} (${selectedStaff.shortName})` : 'Not specified';
                
                const systemInstruction = `**PRIMARY DIRECTIVE: You MUST detect the user's language and respond ONLY in that same language. This is a strict requirement.**

You are CLARA, the official, friendly, and professional AI receptionist for Sai Vidya Institute of Technology (SVIT). Your goal is to assist users efficiently. Keep your spoken responses concise and to the point to ensure a fast, smooth conversation.

**Caller Information (Context):**
- Name: ${name}
- Stated Purpose: ${purpose}
- Staff to connect with: ${staffHint}

**Your Capabilities & Rules:**
1.  **Staff Knowledge:** You know the following staff members. Use this map to identify them if mentioned:
    - LDN: Prof. Lakshmi Durga N
    - ACS: Prof. Anitha C S
    - GD: Dr. G Dhivyasri
    - NSK: Prof. Nisha S K
    - ABP: Prof. Amarnath B Patil
    - NN: Dr. Nagashree N
    - AKV: Prof. Anil Kumar K V
    - JK: Prof. Jyoti Kumari
    - VR: Prof. Vidyashree R
    - BA: Dr. Bhavana A
    - BTN: Prof. Bhavya T N
2.  **College Information:** Answer questions about admissions, fees, placements, facilities, departments, and general college info.
3.  **Actions:**
    - If the user expresses a clear intent to start a video call or meet with a specific staff member (e.g., 'call Anitha', 'I want to see Prof. Lakshmi'), you MUST use the \`initiateVideoCall\` tool. Do not just confirm; use the tool directly.
    - If asked about schedules or availability, offer to check.
4.  **General Queries:** For topics outside of SVIT, act as a helpful general AI assistant.
5.  **Tone:** Always be polite, professional, and helpful.`;
                
                sessionPromiseRef.current = ai.live.connect({
                    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                    callbacks: {
                        onopen: () => {
                          setStatus('Listening...');
                        },
                        onmessage: async (message) => {
                             if (message.toolCall) {
                                for (const fc of message.toolCall.functionCalls) {
                                    if (fc.name === 'initiateVideoCall') {
                                        const { staffShortName } = fc.args;
                                        const staffToCall = staffList.find(s => s.shortName === staffShortName);
                                        
                                        if (staffToCall) {
                                            // Send the tool response *before* closing the session.
                                            sessionPromiseRef.current.then((session) => {
                                                session.sendToolResponse({
                                                    functionResponses: { id : fc.id, name: fc.name, response: { result: "Video call initiated successfully." } }
                                                })
                                            });

                                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            setMessages(prev => [...prev, { sender: 'clara', text: `Initiating video call with ${staffToCall.name}...`, isFinal: true, timestamp }]);
                                            setVideoCallTarget(staffToCall);
                                            setView('video_call');

                                            // Now that the response is sent and UI is updating, close the session.
                                            stopRecording(true);
                                        } else {
                                             const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                             setMessages(prev => [...prev, { sender: 'clara', text: `Sorry, I couldn't find a staff member with the ID "${staffShortName}".`, isFinal: true, timestamp }]);
                                        }
                                    }
                                }
                                return;
                            }
                            if (message.serverContent?.inputTranscription) {
                                currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                            }
                            if (message.serverContent?.outputTranscription) {
                                currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                            }
                            if (message.serverContent?.turnComplete) {
                                const fullInput = currentInputTranscriptionRef.current.trim();
                                const fullOutput = currentOutputTranscriptionRef.current.trim();
                                
                                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                if (fullInput) {
                                    setMessages(prev => [...prev, { sender: 'user', text: fullInput, isFinal: true, timestamp }]);
                                }
                                if (fullOutput) {
                                    setMessages(prev => [...prev, { sender: 'clara', text: fullOutput, isFinal: true, timestamp }]);
                                }
                                
                                currentInputTranscriptionRef.current = '';
                                currentOutputTranscriptionRef.current = '';
                                
                                const checkPlaybackAndReset = () => {
                                    const isPlaying = nextStartTimeRef.current > outputAudioContextRef.current.currentTime;
                                    if (sourcesRef.current.size === 0 && !isPlaying) {
                                        setStatus('Click the microphone to speak');
                                    } else {
                                        setTimeout(checkPlaybackAndReset, 100);
                                    }
                                };
                                setTimeout(checkPlaybackAndReset, 50);
                            }
                            
                            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                            if (base64EncodedAudioString) {
                                setStatus('Responding...');
                                const decodedAudio = decode(base64EncodedAudioString);
                                const audioBuffer = await decodeAudioData(decodedAudio, outputAudioContextRef.current, 24000, 1);

                                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                                const source = outputAudioContextRef.current.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(outputNode);
                                source.start(nextStartTimeRef.current);
                                nextStartTimeRef.current += audioBuffer.duration;
                                sourcesRef.current.add(source);
                                source.onended = () => {
                                    sourcesRef.current.delete(source);
                                };
                            }
                        },
                        onerror: (e) => {
                            console.error('Session error:', e);
                            setStatus(`Error: ${e.message}`);
                            stopRecording(true);
                        },
                        onclose: () => {
                            setStatus('Session ended. Click mic to start again.');
                            sessionPromiseRef.current = null;
                        },
                    },
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                        systemInstruction: systemInstruction,
                        inputAudioTranscription: {},
                        outputAudioTranscription: {},
                        tools: [{ functionDeclarations: [initiateVideoCallFunction] }],
                    },
                });
            }
            
            if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            }

            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            const calculateRMS = (data) => {
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    sum += data[i] * data[i];
                }
                return Math.sqrt(sum / data.length);
            };
            
            silenceStartRef.current = null;
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                
                const pcmBlob = createBlob(inputData);
                if (sessionPromiseRef.current) {
                    sessionPromiseRef.current.then((session) => {
                        session.sendRealtimeInput({ media: pcmBlob });
                    }).catch(err => console.error("Error sending audio:", err));
                }

                // Automatic stop on silence
                const volume = calculateRMS(inputData);
                const SILENCE_THRESHOLD = 0.01;
                const SPEECH_TIMEOUT = 1200; // 1.2 seconds

                if (volume > SILENCE_THRESHOLD) {
                    silenceStartRef.current = null;
                } else {
                    if (silenceStartRef.current === null) {
                        silenceStartRef.current = Date.now();
                    } else if (Date.now() - silenceStartRef.current > SPEECH_TIMEOUT) {
                        if (isRecordingRef.current) {
                            stopRecording(false);
                            setStatus('Processing...');
                        }
                    }
                }
            };

            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

        } catch (error) {
            console.error('Error starting recording:', error);
            setStatus(`Error: ${error.message}`);
            isRecordingRef.current = false;
            setIsRecording(false);
        }
    };
    
    const renderContent = () => {
        if (showPreChatModal) {
            return <PreChatModal onStart={handleStartConversation} />;
        }
        if (view === 'video_call' && videoCallTarget) {
            return <VideoCallView staff={videoCallTarget} onEndCall={handleEndCall} />;
        }
        return (
            <div className="app-container">
                <div className="header">
                     <div className="header-left">
                        <RobotIcon size={28} />
                        <span>Clara</span>
                    </div>
                    <div className="header-right">
                        <div className="header-button college-demo">
                            <GraduationCapIcon />
                            <span>College Demo</span>
                        </div>
                        <div className="header-button staff-login">
                            <StaffLoginIcon />
                            <span>Staff Login</span>
                        </div>
                        <div className="header-button video-call">
                            <VideoCallHeaderIcon />
                            <span>Video Call</span>
                        </div>
                         <div className="status-indicator">
                            <div className="status-dot"></div>
                            <span>Ready to chat</span>
                        </div>
                    </div>
                </div>

                <div className="chat-container" ref={chatContainerRef}>
                    {messages.map((msg, index) => (
                        <div key={index} className={`message-wrapper ${msg.sender}`}>
                            <div className="message-avatar">
                                {msg.sender === 'user' ? <UserIcon size={20} /> : <RobotIcon size={20} />}
                            </div>
                            <div className="message-content">
                                <p>{msg.text}</p>
                            </div>
                             <div className="timestamp">{msg.timestamp}</div>
                        </div>
                    ))}
                </div>

                <div className="footer">
                     <button 
                        className={`mic-button ${isRecording ? 'recording' : ''}`} 
                        onClick={handleMicClick}
                        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                    >
                        <MicOnIcon size={28} />
                    </button>
                    <div className="footer-status-text">
                        {status}
                    </div>
                    <div className="footer-options">
                        <div className="option-item">
                            <SpeakerIcon />
                            <span>Clara voice enabled</span>
                        </div>
                        <div className="option-item">
                            <PencilIcon />
                            <span>Text cleaning enabled</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return <>{renderContent()}</>;
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);