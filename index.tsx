import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, FunctionDeclaration, Type } from '@google/genai';

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

const proposeVideoCallFunction: FunctionDeclaration = {
    name: 'proposeVideoCall',
    description: 'Proposes a video call to the user and asks for their confirmation. This should be used when the user explicitly asks to "call" a staff member.',
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

const ApiKeySelectionModal = ({ onSelect, error }) => (
    <div className="modal-overlay">
        <div className="modal-content">
            <div className="modal-header">
                <RobotIcon size={28} />
                <h1>API Key Required</h1>
            </div>
            <p>To enable Clara's full capabilities, please select a Google AI Studio API key. This is required for voice interaction.</p>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '-12px', marginBottom: '24px' }}>
                Note: Charges may apply for Gemini API usage. See the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer">billing documentation</a> for details.
            </p>
            {error && <p className="error-message">{error}</p>}
            <button onClick={onSelect}>Select API Key</button>
        </div>
    </div>
);

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