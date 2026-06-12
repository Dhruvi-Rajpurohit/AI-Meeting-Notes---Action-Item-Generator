import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';

function App() {
  // Navigation & View States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [isDarkMode, setIsDarkMode] = useState(true); 
  const [isDragging, setIsDragging] = useState(false); 

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Interface Controls
  const [sourceType, setSourceType] = useState('text'); 
  const [processingMode, setProcessingMode] = useState('Auto-Detect'); 
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Results & AI Meta Data
  const [summaryOutput, setSummaryOutput] = useState('');
  const [detectedType, setDetectedType] = useState('');
  const [documentTone, setDocumentTone] = useState('');
  const [extractedEntities, setExtractedEntities] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [telemetry, setTelemetry] = useState(null);

  // Audio Reading States
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef(window.speechSynthesis);

  const BACKEND_URL = 'http://127.0.0.1:5000/api';

  const wordCount = textInput.trim() ? textInput.trim().split(/\s+/).length : 0;
  const charCount = textInput.length;
  const readingTimeEst = Math.max(1, Math.round(wordCount / 220));

  const theme = {
    bg: isDarkMode ? '#060913' : '#f8fafc',
    cardBg: isDarkMode ? '#0f1626' : '#ffffff',
    text: isDarkMode ? '#d1d5db' : '#334155',
    title: isDarkMode ? '#ffffff' : '#0f172a',
    border: isDarkMode ? '#1e293b' : '#e2e8f0',
    inputBg: isDarkMode ? '#172237' : '#f1f5f9',
    subtext: isDarkMode ? '#9ca3af' : '#64748b',
    accent: '#10b981', 
    brandGlow: isDarkMode ? '0 8px 32px rgba(16, 185, 129, 0.04)' : '0 4px 20px rgba(0,0,0,0.05)'
  };

  // NEW: The Global Refresh Handler
  const handleGlobalRefresh = () => {
    // 1. Stop any active text-to-speech audio
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
    // 2. Wipe current active workspace state clean
    setTextInput('');
    setSelectedFile(null);
    setSummaryOutput('');
    setDetectedType('');
    setDocumentTone('');
    setExtractedEntities([]);
    setTelemetry(null);

    // 3. Re-sync user history lists from backend if logged in
    if (isLoggedIn && currentUser) {
      fetchUserHistory(currentUser);
    }
  };

  const handleToggleSpeech = () => {
    if (!summaryOutput) return;
    if (isSpeaking) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    } else {
      synthRef.current.cancel(); 
      const plainText = summaryOutput.replace(/[#*`•-]/g, '');
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      synthRef.current.speak(utterance);
    }
  };

  const handleCopyToClipboard = () => {
    if (!summaryOutput) return;
    navigator.clipboard.writeText(summaryOutput);
    alert('Copied to clipboard! 📋');
  };

  const fetchUserHistory = async (user) => {
    try {
      const res = await fetch(`${BACKEND_URL}/history/${user}`);
      const data = await res.json();
      if (data && data.history) setSavedHistory(data.history);
    } catch (err) {
      console.error("Error loading history:", err);
    }
  };

  useEffect(() => {
    if (isLoggedIn && currentUser) fetchUserHistory(currentUser);
    return () => { if (synthRef.current) synthRef.current.cancel(); };
  }, [isLoggedIn, currentUser]);

  const handleAuthentication = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!username.trim() || !password.trim()) { setAuthError('Please fill in all fields.'); return; }

    if (isRegisterMode) {
      if (!email.trim() || password !== confirmPassword) { setAuthError('Passwords do not match.'); return; }
      try {
        const res = await fetch(`${BACKEND_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        if (res.ok) { alert('Account created!'); setIsRegisterMode(false); } 
        else { const d = await res.json(); setAuthError(d.detail || 'Registration failed.'); }
      } catch { setAuthError('Cannot connect to server.'); }
    } else {
      try {
        const res = await fetch(`${BACKEND_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (res.ok) {
          const d = await res.json();
          setCurrentUser(d.username);
          setIsLoggedIn(true);
          setShowAuthModal(false);
        } else { setAuthError('Invalid credentials.'); }
      } catch { setAuthError('Server error.'); }
    }
  };

  const handleProcessDocument = async () => {
    setIsProcessing(true);
    setSummaryOutput('');
    setDetectedType('');
    setDocumentTone('');
    setExtractedEntities([]);
    setTelemetry(null);
    if (synthRef.current) synthRef.current.cancel();
    setIsSpeaking(false);
    
    const formData = new FormData();
    formData.append('username', isLoggedIn ? currentUser : 'Guest_User');
    formData.append('processing_mode', processingMode);

    if (sourceType === 'text') {
      if (!textInput.trim()) { alert('Please enter some text first.'); setIsProcessing(false); return; }
      formData.append('filename', 'Pasted_Text.txt');
      formData.append('text', textInput);
    } else {
      if (!selectedFile) { alert('Please select a file first.'); setIsProcessing(false); return; }
      formData.append('filename', selectedFile.name);
      formData.append('file', selectedFile);
    }

    try {
      const res = await fetch(`${BACKEND_URL}/process`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setSummaryOutput(data.summary);
        setDetectedType(data.detected_type);
        setDocumentTone(data.document_tone);
        setExtractedEntities(data.extracted_entities || []);
        setTelemetry({ velocity: data.velocity, compression: data.compression_ratio, time_saved: data.time_saved_mins, cached: data.cached });
        if (isLoggedIn) fetchUserHistory(currentUser); 
      } else { alert(data.detail || 'Failed to analyze.'); }
    } catch { alert('Connection error.'); }
    finally { setIsProcessing(false); }
  };

  const downloadPDFReport = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFont("Helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(16, 185, 129);
    doc.text("Document Summary Report", 20, 25);
    doc.setFont("Helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 116, 139);
    doc.text(`Type: ${detectedType || processingMode} | Tone: ${documentTone || 'N/A'}`, 20, 32);
    doc.line(20, 36, 190, 36);

    const lines = summaryOutput.split('\n');
    let y = 45;
    lines.forEach((line) => {
      if (y > 270) { doc.addPage(); y = 25; }
      let cleanLine = line.replace(/[#*`•-]/g, '').trim();
      if (!cleanLine) { y += 4; return; }
      doc.setFont("Helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      const splitText = doc.splitTextToSize(cleanLine, 170);
      splitText.forEach((p) => { doc.text(p, 20, y); y += 6; });
    });
    doc.save(`Summary_Report.pdf`);
  };

  return (
    <div style={{...styles.appFrame, backgroundColor: theme.bg}}>
      
      <nav style={{...styles.navbar, backgroundColor: theme.cardBg, borderColor: theme.border}}>
        <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{...styles.simpleBtn, color: theme.title, backgroundColor: theme.inputBg, borderColor: theme.border}}>
            {isSidebarOpen ? '◀ Hide History' : '▶ Show History'}
          </button>
          <span style={{...styles.logo, color: theme.title}}>
            Transcript-To-<span style={{color: theme.accent}}>Summary</span>
          </span>
        </div>

        <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
          <button 
            onClick={handleGlobalRefresh} 
            style={{...styles.simpleBtn, backgroundColor: theme.inputBg, color: theme.accent, borderColor: theme.accent}}
            title="Clear workspace and reload sync vectors"
          >
            🔄 Refresh App
          </button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} style={{...styles.simpleBtn, backgroundColor: theme.inputBg, color: theme.title, borderColor: theme.border}}>
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </nav>

      <div style={{display: 'flex', flex: 1, width: '100%', overflow: 'hidden'}}>
        
        <div style={{...styles.sidebar, width: isSidebarOpen ? '300px' : '0px', backgroundColor: theme.cardBg, borderRightColor: theme.border, opacity: isSidebarOpen ? 1 : 0}}>
          <div style={{padding: '24px', minWidth: '260px', boxSizing: 'border-box'}}>
            
            <div style={{...styles.sidebarSection, backgroundColor: theme.inputBg, borderColor: theme.border}}>
              {!isLoggedIn ? (
                <button onClick={() => { setShowAuthModal(true); setAuthError(''); }} style={{...styles.primaryBtn, backgroundColor: theme.accent}}>
                  Sign In / Create Account
                </button>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap: '8px'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span style={styles.badge}>Account Active</span>
                    <button onClick={() => { setIsLoggedIn(false); setCurrentUser(''); setSavedHistory([]); }} style={styles.dangerBtn}>Sign Out</button>
                  </div>
                  <span style={{fontSize:'14px', color: theme.title, fontWeight: '600'}}>{currentUser}</span>
                </div>
              )}
            </div>

            <div style={{marginTop: '24px'}}>
              <h5 style={{...styles.sidebarHeading, color: theme.subtext}}>Saved History</h5>
              <div style={styles.scrollingList}>
                {!isLoggedIn ? (
                  <p style={{fontSize: '13px', color: theme.subtext, fontStyle: 'italic', lineHeight: '1.5'}}>Log in to save and access your past file text analyses here.</p>
                ) : savedHistory.length === 0 ? (
                  <p style={{fontSize: '13px', color: theme.subtext, fontStyle: 'italic'}}>No items found yet.</p>
                ) : (
                  savedHistory.map((item, index) => (
                    <div key={index} style={{...styles.historyCard, backgroundColor: theme.inputBg, borderColor: theme.border}} onClick={() => { setSummaryOutput(item.summary); setDetectedType(item.detected_type); setDocumentTone(item.document_tone); setExtractedEntities(item.extracted_entities || []); }}>
                      <strong style={{fontSize:'13px', color: theme.title, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>📄 {item.filename}</strong>
                      <span style={{fontSize: '11px', color: theme.accent}}>{item.processing_mode}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>

        <div style={styles.mainCanvas}>
          <div style={styles.mainGrid}>
            
            <div style={{...styles.workspaceCard, backgroundColor: theme.cardBg, borderColor: theme.border, boxShadow: theme.brandGlow}}>
              <div style={{...styles.tabBar, borderBottomColor: theme.border}}>
                {['text', 'file'].map((tab) => (
                  <button key={tab} style={{...styles.tabBtn, borderBottom: sourceType === tab ? `3px solid ${theme.accent}` : '3px solid transparent', color: sourceType === tab ? theme.title : theme.subtext, fontWeight: sourceType === tab ? '700' : '500'} } onClick={() => { setSourceType(tab); setSelectedFile(null); }}>
                    {tab === 'text' ? 'Paste Text' : 'Upload File'}
                  </button>
                ))}
              </div>

              {sourceType === 'text' && (
                <div style={styles.statsBar}>
                  <div style={{color: theme.subtext, fontSize:'12px'}}>Words: <span style={{color: theme.accent}}>{wordCount}</span></div>
                  <div style={{color: theme.subtext, fontSize:'12px'}}>Characters: <span style={{color: theme.accent}}>{charCount}</span></div>
                  <div style={{color: theme.subtext, fontSize:'12px'}}>Reading Time: <span style={{color: theme.accent}}>{readingTimeEst} min</span></div>
                </div>
              )}

              <div style={styles.fieldGroup}>
                <label style={{...styles.fieldLabel, color: theme.subtext}}>Analysis Profile Style:</label>
                <select value={processingMode} onChange={(e) => setProcessingMode(e.target.value)} style={{...styles.selectMenu, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.title}}>
                  <option value="Auto-Detect">✨ Let AI Auto-Detect Type & Profile Style</option>
                  <option value="Meeting Minutes">Meeting Summary (Action Items Focus)</option>
                  <option value="Technical Audit">Technical Audit (Bugs, Failures & Logs Focus)</option>
                  <option value="Executive Summary">Executive Summary (Short Paragraph Focus)</option>
                </select>
              </div>

              <div style={{...styles.textAreaWrapper, backgroundColor: theme.inputBg, borderColor: theme.border}}>
                {sourceType === 'text' ? (
                  <textarea style={{...styles.pureTextarea, color: theme.title}} value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="Type or paste your text context directly here..." />
                ) : (
                  <div 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(e.dataTransfer.files[0]) setSelectedFile(e.dataTransfer.files[0]); }}
                    style={{ ...styles.dropZone, backgroundColor: isDragging ? 'rgba(16, 185, 129, 0.05)' : 'transparent', borderColor: isDragging ? theme.accent : theme.border }}
                  >
                    <span style={{fontSize:'36px', marginBottom:'8px', display:'block'}}>📂</span>
                    <input type="file" accept=".pdf,.txt,.log,.md" onChange={e => setSelectedFile(e.target.files[0])} style={styles.hiddenFileInput} />
                    <p style={{fontSize:'14px', fontWeight:'700', color: theme.title, margin:0}}>{selectedFile ? `Selected: ${selectedFile.name}` : `Drag your document here or click to browse`}</p>
                    <p style={{fontSize:'12px', color: theme.subtext, marginTop: '4px'}}>Accepts PDF, TXT, or LOG files</p>
                  </div>
                )}
              </div>

              <button onClick={handleProcessDocument} style={{...styles.primaryBtn, backgroundColor: theme.accent, padding:'14px', marginTop:'14px'}} disabled={isProcessing}>
                {isProcessing ? 'Analyzing Data Structure...' : 'Analyze Document Now'}
              </button>
            </div>

            <div style={{...styles.workspaceCard, backgroundColor: theme.cardBg, borderColor: theme.border, boxShadow: theme.brandGlow}}>
              <div style={{...styles.tabBar, borderBottomColor: theme.border, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{color: theme.title, fontWeight: '700'}}>AI Output Summary</span>
                
                {summaryOutput && !isProcessing && (
                  <div style={{display:'flex', gap:'8px'}}>
                    <button onClick={handleToggleSpeech} style={{...styles.miniBtn, backgroundColor: isSpeaking ? '#ef4444' : theme.inputBg, color: isSpeaking ? '#fff' : theme.title, borderColor: theme.border}}>
                      {isSpeaking ? '⏹ Stop Voice' : '🔊 Speak Summary'}
                    </button>
                    <button onClick={handleCopyToClipboard} style={{...styles.miniBtn, backgroundColor: theme.inputBg, color: theme.title, borderColor: theme.border}}>
                      📋 Copy Text
                    </button>
                  </div>
                )}
              </div>

              {summaryOutput && !isProcessing && (
                <div style={{display:'flex', flexDirection:'column', gap:'12px', marginBottom:'16px'}}>
                  <div style={{...styles.aiMetaRow, backgroundColor: theme.inputBg, borderColor: theme.border}}>
                    <div>
                      <span style={{fontSize:'10px', color: theme.subtext, display:'block', fontWeight:'700'}}>AI DETECTED TYPE</span>
                      <span style={{fontSize:'13px', color: theme.accent, fontWeight:'700'}}>{detectedType || 'Processing...'}</span>
                    </div>
                    <div>
                      <span style={{fontSize:'10px', color: theme.subtext, display:'block', fontWeight:'700'}}>DOCUMENT TONE</span>
                      <span style={{fontSize:'13px', color: '#3b82f6', fontWeight:'700'}}>{documentTone || 'Processing...'}</span>
                    </div>
                    {telemetry && (
                      <div>
                        <span style={{fontSize:'10px', color: theme.subtext, display:'block', fontWeight:'700'}}>COMPRESSION</span>
                        <span style={{fontSize:'13px', color: theme.title, fontWeight:'700'}}>-{telemetry.compression}% Size</span>
                      </div>
                    )}
                  </div>

                  {extractedEntities.length > 0 && (
                    <div style={{display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center'}}>
                      <span style={{fontSize:'11px', color: theme.subtext, fontWeight:'700'}}>KEY TOPICS:</span>
                      {extractedEntities.map((entity, idx) => (
                        <span key={idx} style={{fontSize:'11px', backgroundColor: theme.inputBg, color: theme.title, padding:'3px 8px', borderRadius:'4px', border:`1px solid ${theme.border}`}}>
                          {entity}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{...styles.textAreaWrapper, backgroundColor: theme.inputBg, borderColor: theme.border}}>
                {isProcessing ? (
                  <div style={styles.spinnerCenter}>
                    <div style={{...styles.spinner, borderTopColor: theme.accent}} />
                    <p style={{fontSize:'13px', color: theme.accent, fontWeight:'600'}}>AI engine is actively extracting insight layers...</p>
                  </div>
                ) : summaryOutput ? (
                  <div style={styles.scrollingOutput}>
                    {summaryOutput.split('\n').map((line, idx) => {
                      const cleanLine = line.replace(/[#*`•-]/g, '').trim();
                      if (!cleanLine) return <div key={idx} style={{ height: '8px' }} />;
                      if (line.startsWith('#')) return <h4 key={idx} style={{color: theme.accent, margin:'16px 0 6px 0', textTransform:'uppercase', fontSize:'13px'}}>{cleanLine}</h4>;
                      return <p key={idx} style={{fontSize:'14px', lineHeight:'1.6', margin:'0 0 10px 0', color: theme.text, textAlign:'justify'}}>{line}</p>;
                    })}
                  </div>
                ) : (
                  <div style={styles.emptyOutput}>Your analyzed summary, detected tones, and keyword tracking metrics will appear here.</div>
                )}
              </div>

              {summaryOutput && !isProcessing && (
                <button onClick={downloadPDFReport} style={styles.pdfBtn}>📥 Download Clean PDF Report</button>
              )}
            </div>

          </div>
        </div>

      </div>

      {showAuthModal && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalCard, backgroundColor: theme.cardBg, borderColor: theme.border}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px'}}>
              <h3 style={{margin:0, fontSize:'16px', color: theme.title}}>{isRegisterMode ? 'Create Profile' : 'User Verification'}</h3>
              <button onClick={() => setShowAuthModal(false)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleAuthentication} style={{display:'flex', flexDirection:'column'}}>
              <label style={styles.formLabel}>Username</label>
              <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{...styles.authInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.title}} />
              {isRegisterMode && (
                <>
                  <label style={styles.formLabel}>Email</label>
                  <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{...styles.authInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.title}} />
                </>
              )}
              <label style={styles.formLabel}>Password</label>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} style={{...styles.authInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.title}} />
              {isRegisterMode && (
                <>
                  <label style={styles.formLabel}>Confirm Password</label>
                  <input type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{...styles.authInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.title}} />
                </>
              )}
              {authError && <div style={styles.errorBox}>{authError}</div>}
              <button type="submit" style={{...styles.primaryBtn, backgroundColor: theme.accent, padding:'10px'}}>{isRegisterMode ? 'Sign Up' : 'Log In'}</button>
              <button type="button" onClick={() => { setIsRegisterMode(!isRegisterMode); setAuthError(''); }} style={{background:'transparent', border:'none', color: theme.accent, fontSize:'12px', marginTop:'12px', cursor:'pointer'}}>
                {isRegisterMode ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  appFrame: { minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' },
  navbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid' },
  logo: { fontWeight: '800', fontSize: '20px', letterSpacing: '-0.5px' },
  simpleBtn: { border: '1px solid', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  primaryBtn: { color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  dangerBtn: { backgroundColor: 'transparent', border: '1px solid #fee2e2', color: '#ef4444', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' },
  miniBtn: { border: '1px solid', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  pdfBtn: { backgroundColor: '#1e293b', color: '#ffffff', border: '1px solid #334155', padding: '12px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', marginTop: '14px', width: '100%' },
  
  sidebar: { display:'flex', flexDirection:'column', overflowY: 'auto', borderRight: '1px solid', transition: 'all 0.2s', height: '100%' },
  sidebarSection: { padding: '14px', borderRadius: '8px', border: '1px solid', display: 'flex', flexDirection: 'column' },
  badge: { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '10px', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' },
  sidebarHeading: { fontSize: '11px', fontWeight: '700', margin: '0 0 10px 0', textTransform: 'uppercase' },
  scrollingList: { display:'flex', flexDirection:'column', gap: '8px' },
  historyCard: { border: '1px solid', borderRadius: '6px', padding: '10px', cursor: 'pointer', textAlign: 'left' },
  
  mainCanvas: { flex: 1, height: '100%', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: '20px' },
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '100%', flex: 1 },
  workspaceCard: { border: '1px solid', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column' },
  tabBar: { display: 'flex', gap: '20px', borderBottom: '1px solid', marginBottom: '16px' },
  tabBtn: { border: 'none', background: 'transparent', padding: '8px 0', fontSize: '14px', cursor: 'pointer' },
  
  statsBar: { display: 'flex', gap: '14px', backgroundColor: 'rgba(0,0,0,0.05)', padding: '6px 12px', borderRadius: '6px', marginBottom: '12px', width: 'max-content' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px', textAlign: 'left' },
  fieldLabel: { fontSize: '11px', fontWeight: '700' },
  selectMenu: { border: '1px solid', padding: '10px', borderRadius: '6px', fontSize: '13px', outline: 'none', cursor: 'pointer' },
  
  textAreaWrapper: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: '380px', border: '1px solid', borderRadius: '10px', padding: '14px', boxSizing: 'border-box' },
  pureTextarea: { width: '100%', flex: 1, backgroundColor: 'transparent', border: 'none', fontSize: '14px', lineHeight: '1.6', outline: 'none', resize: 'none' },
  dropZone: { border: '2px dashed', borderRadius: '8px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative' },
  hiddenFileInput: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' },
  
  aiMetaRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 14px', borderRadius: '8px', border: '1px solid', textAlign: 'left', gap: '10px' },
  scrollingOutput: { flex: 1, overflowY: 'auto', textAlign: 'left' },
  emptyOutput: { fontSize: '13px', color: '#6b7280', fontStyle: 'italic', margin: 'auto', textAlign: 'center' },
  spinnerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: 'auto', gap: '10px' },
  spinner: { width: '24px', height: '24px', border: '3px solid #334155', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalCard: { padding: '24px', borderRadius: '12px', border: '1px solid', width: '340px', boxSizing: 'border-box' },
  closeBtn: { background: 'transparent', border: 'none', fontSize: '14px', color: '#9ca3af', cursor: 'pointer' },
  formLabel: { display: 'block', color: '#9ca3af', fontSize: '11px', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' },
  authInput: { border: '1px solid', padding: '10px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' },
  errorBox: { backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #fca5a5', color: '#f87171', padding: '8px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }
};

export default App;