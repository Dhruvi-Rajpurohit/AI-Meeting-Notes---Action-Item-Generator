import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';

function App() {
  // UI States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [isDarkMode, setIsDarkMode] = useState(true); 

  // Auth Inputs
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Core Processing States
  const [sourceType, setSourceType] = useState('text'); 
  const [processingMode, setProcessingMode] = useState('Auto-Detect'); 
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Stats & Output States
  const [summaryOutput, setSummaryOutput] = useState('');
  const [detectedType, setDetectedType] = useState('');
  const [documentTone, setDocumentTone] = useState('');
  const [speakerDistribution, setSpeakerDistribution] = useState([]); 
  const [stats, setStats] = useState({ compression: 0, timeSaved: 0, speed: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);

  // Chatbot States
  const [showChatroom, setShowChatroom] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [userChatInput, setUserChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const chatEndRef = useRef(null);

  const BACKEND_URL = 'http://127.0.0.1:8000/api';

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.backgroundColor = isDarkMode ? '#0f172a' : '#f8fafc';
  }, [isDarkMode]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const theme = {
    bg: isDarkMode ? '#0f172a' : '#f8fafc',
    cardBg: isDarkMode ? '#1e293b' : '#ffffff',
    text: isDarkMode ? '#cbd5e1' : '#475569',
    title: isDarkMode ? '#f8fafc' : '#0f172a',
    border: isDarkMode ? '#334155' : '#e2e8f0',
    inputBg: isDarkMode ? '#1e293b' : '#ffffff',
    subtext: isDarkMode ? '#64748b' : '#94a3b8',
    accent: '#10b981', 
    primary: '#4f46e5', 
    userMsg: isDarkMode ? '#312e81' : '#e0e7ff',
    aiMsg: isDarkMode ? '#334155' : '#f1f5f9',
  };

  const handleGlobalRefresh = () => {
    setTextInput('');
    setSelectedFile(null);
    setSummaryOutput('');
    setDetectedType('');
    setDocumentTone('');
    setSpeakerDistribution([]);
    setStats({ compression: 0, timeSaved: 0, speed: 0 });
    setChatMessages([]);
    setShowChatroom(false);
  };

  const handleCopyToClipboard = () => {
    if (!summaryOutput) return;
    navigator.clipboard.writeText(summaryOutput);
    alert('Summary copied to clipboard! 📋');
  };

  const handleDownloadPDF = () => {
    if (!summaryOutput) return;
    const doc = new jsPDF();
    
    const startX = 16;
    let currentY = 24;
    const maxLineWidth = 178;
    const pageHeight = doc.internal.pageSize.height;

    const checkPageOverflow = (neededHeight) => {
      if (currentY + neededHeight > pageHeight - 20) {
        doc.addPage();
        currentY = 20; 
      }
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); 
    doc.text("AI Summary Report", startX, currentY);
    currentY += 6;

    doc.setDrawColor(79, 70, 229); 
    doc.setLineWidth(1.5);
    doc.line(startX, currentY, startX + 50, currentY);
    currentY += 14;

    const lines = summaryOutput.split('\n');

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!cleanLine) {
        currentY += 4; 
        return;
      }

      if (cleanLine.startsWith('###')) {
        const headingText = cleanLine.replace(/^###\s*/, '');
        checkPageOverflow(14);
        currentY += 6; 
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(79, 70, 229); 
        doc.text(headingText, startX, currentY);
        currentY += 8; 
      } 
      else if (cleanLine.startsWith('-')) {
        const bulletText = cleanLine.replace(/^-\s*/, '');
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(71, 85, 105); 

        const wrappedBulletLines = doc.splitTextToSize(bulletText, maxLineWidth - 8);
        const totalHeight = wrappedBulletLines.length * 6;
        
        checkPageOverflow(totalHeight);

        doc.setFillColor(79, 70, 229); 
        doc.circle(startX + 2, currentY - 3.5, 1, 'F');

        wrappedBulletLines.forEach((bLine, bIdx) => {
          doc.text(bLine, startX + 8, currentY + (bIdx * 6));
        });

        currentY += totalHeight + 2;
      } 
      else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(71, 85, 105); 

        const wrappedBodyLines = doc.splitTextToSize(cleanLine, maxLineWidth);
        const totalHeight = wrappedBodyLines.length * 6;

        checkPageOverflow(totalHeight);

        wrappedBodyLines.forEach((pLine, pIdx) => {
          doc.text(pLine, startX, currentY + (pIdx * 6));
        });

        currentY += totalHeight + 3;
      }
    });

    doc.save("Summary_Report.pdf");
  };

  const fetchUserHistory = async (user) => {
    try {
      const res = await fetch(`${BACKEND_URL}/history/${user}`);
      const data = await res.json();
      if (data?.history) setSavedHistory(data.history);
    } catch (err) { console.error(err); }
  };

  const handleAuthentication = async (e) => {
    e.preventDefault();
    if (isRegisterMode) {
      const hasNumber = /\d/.test(password);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>_]/.test(password);

      if (password.length < 6) {
        return alert("⚠️ Security Error: Password must be at least 6 characters long.");
      }
      if (!hasNumber) {
        return alert("⚠️ Security Error: Password must contain at least one numerical digit (0-9).");
      }
      if (!hasSpecial) {
        return alert("⚠️ Security Error: Password must contain at least one special character.");
      }

      try {
        const res = await fetch(`${BACKEND_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        if (res.ok) { alert('Account created! You can now log in.'); setIsRegisterMode(false); }
      } catch { alert('Registration failed.'); }
    } else {
      try {
        const res = await fetch(`${BACKEND_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (res.ok) { setIsLoggedIn(true); setCurrentUser(username); setShowAuthModal(false); fetchUserHistory(username); }
      } catch { alert('Wrong username or password.'); }
    }
  };

  const handleProcessDocument = async () => {
    if (sourceType === 'text' && !textInput.trim()) return alert('Please enter some text first.');
    if (sourceType === 'file' && !selectedFile) return alert('Please upload a file first.');

    setIsProcessing(true);
    setSummaryOutput('');
    setSpeakerDistribution([]);
    setShowChatroom(false);

    const formData = new FormData();
    formData.append('username', isLoggedIn ? currentUser : 'Guest');
    formData.append('processing_mode', processingMode);

    if (sourceType === 'text') {
      formData.append('filename', 'Pasted_Text.txt');
      formData.append('text', textInput);
    } else {
      formData.append('filename', selectedFile.name);
      formData.append('file', selectedFile);
    }

    try {
      const res = await fetch(`${BACKEND_URL}/process`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setSummaryOutput(data.summary);
        setDetectedType(data.detected_type || 'Text Document');
        setDocumentTone(data.document_tone || 'Professional');
        setSpeakerDistribution(data.speaker_distribution || []);
        setStats({
          compression: data.compression_ratio || 75,
          timeSaved: data.time_saved_mins || 5,
          speed: data.velocity || 1.2
        });
        if (isLoggedIn) fetchUserHistory(currentUser);
      } else { alert(data.detail); }
    } catch { alert('Server connection dropped.'); }
    finally { setIsProcessing(false); }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!userChatInput.trim()) return;

    const currentInput = userChatInput;
    const historyPayload = [...chatMessages, { role: 'user', content: currentInput }];
    setChatMessages(historyPayload);
    setUserChatInput('');
    setIsChatSending(true);

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_summary: summaryOutput, history: chatMessages, user_message: currentInput })
      });
      const data = await res.json();
      setChatMessages([...historyPayload, { role: 'assistant', content: data.response }]);
    } catch { 
      setChatMessages([...historyPayload, { role: 'assistant', content: 'Connection dropped.' }]); 
    } finally { 
      setIsChatSending(false); 
    }
  };

  const parseMarkdown = (rawText) => {
    if (!rawText) return null;
    return rawText.split('\n').map((line, index) => {
      if (line.startsWith('### ')) {
        return <h3 key={index} style={{ color: theme.title, marginTop: '18px', marginBottom: '8px', fontSize: '16px', fontWeight: '700' }}>{line.replace('### ', '')}</h3>;
      } else if (line.startsWith('- ')) {
        let bulletText = line.replace('- ', '');
        
        // CHECK IF BULLET LINE CONTAINS A PREDICTED DEADLINE TAG [Due: ...]
        const dueRegex = /\[Due:\s*([^\]]+)\]/;
        const match = bulletText.match(dueRegex);
        
        if (match) {
          const deadlineText = match[1];
          const cleanText = bulletText.replace(dueRegex, '').trim();
          
          return (
            <li key={index} style={{ marginLeft: '16px', marginBottom: '8px', listStyleType: 'disc', fontSize: '14px', lineHeight: '1.5', color: theme.text }}>
              <span>{cleanText}</span>
              <span style={{
                marginLeft: '8px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 'bold',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                display: 'inline-block',
                verticalAlign: 'middle'
              }}>
                ⏳ Deadline: {deadlineText}
              </span>
            </li>
          );
        }

        return <li key={index} style={{ marginLeft: '16px', marginBottom: '6px', listStyleType: 'disc', fontSize: '14px', lineHeight: '1.5' }}>{bulletText}</li>;
      }
      return line.trim() ? <p key={index} style={{ marginBottom: '8px', lineHeight: '1.5', fontSize: '14px' }}>{line}</p> : <div key={index} style={{ height: '6px' }} />;
    });
  };

  return (
    <div style={{...styles.appFrame, backgroundColor: theme.bg, color: theme.text}}>
      
      <nav style={{...styles.navbar, backgroundColor: theme.cardBg, borderColor: theme.border}}>
        <div style={{display:'flex', gap:'16px', alignItems:'center'}}>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{...styles.secondaryBtn, borderColor: theme.border, color: theme.title}}>
            {isSidebarOpen ? '◀ Hide Sidebar' : '▶ Show Sidebar'}
          </button>
          <span style={{...styles.logo, color: theme.title}}>AI Transcript <span style={{color: theme.accent}}>Summarizer</span></span>
        </div>
        <div style={{display:'flex', gap: '12px'}}>
          <button onClick={handleGlobalRefresh} style={{...styles.secondaryBtn, borderColor: theme.border, color: theme.title}}>🔄 Reset Workspace</button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} style={{...styles.secondaryBtn, borderColor: theme.border, color: theme.title}}>{isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}</button>
        </div>
      </nav>

      <div style={{display: 'flex', flex: 1, width: '100%', overflow: 'hidden'}}>
        
        <div style={{...styles.sidebar, width: isSidebarOpen ? '260px' : '0px', backgroundColor: theme.cardBg, borderRightColor: theme.border, opacity: isSidebarOpen ? 1 : 0}}>
          <div style={{padding: '20px'}}>
            {!isLoggedIn ? (
              <button onClick={() => { setIsRegisterMode(false); setShowAuthModal(true); }} style={{...styles.primaryBtn, backgroundColor: theme.primary, width:'100%'}}>Sign In / Create Account</button>
            ) : (
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background: theme.bg, padding: '8px 12px', borderRadius: '6px'}}>
                <span style={{color: theme.title, fontWeight:'600'}}>👤 {currentUser}</span>
                <button onClick={() => { setIsLoggedIn(false); setSavedHistory([]); }} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'12px', fontWeight:'700'}}>Logout</button>
              </div>
            )}
            
            <h4 style={{color: theme.subtext, fontSize:'11px', letterSpacing:'0.5px', marginTop:'24px', marginBottom:'12px', fontWeight:'700', textTransform:'uppercase'}}>Saved Summaries</h4>
            <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
              {savedHistory.length === 0 ? <p style={{fontSize:'12px', color: theme.subtext, fontStyle:'italic'}}>Sign in to save your history automatically.</p> : null}
              {savedHistory.map((h, i) => (
                <div key={i} style={{...styles.historyCard, backgroundColor: theme.bg, borderColor: theme.border, color: theme.title}} onClick={() => { setSummaryOutput(h.summary); setDetectedType(h.detected_type); setDocumentTone(h.document_tone); setSpeakerDistribution(h.speaker_distribution || []); setStats({ compression: h.compression_ratio, timeSaved: h.time_saved_mins, speed: h.velocity }); }}>
                  📄 {h.filename}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={styles.mainCanvas}>
          <div style={styles.mainGrid}>
            
            <div style={{...styles.workspaceCard, backgroundColor: theme.cardBg, borderColor: theme.border}}>
              <div style={{...styles.tabBar, borderBottom: `2px solid ${theme.border}`}}>
                <button style={{...styles.tabBtn, color: sourceType==='text'? theme.accent : theme.subtext, borderBottom: sourceType==='text'? `3px solid ${theme.accent}` : 'none'}} onClick={() => setSourceType('text')}>Paste Text</button>
                <button style={{...styles.tabBtn, color: sourceType==='file'? theme.accent : theme.subtext, borderBottom: sourceType==='file'? `3px solid ${theme.accent}` : 'none'}} onClick={() => setSourceType('file')}>Upload Document File</button>
              </div>

              {sourceType === 'text' ? (
                <textarea style={{...styles.pureTextarea, backgroundColor: theme.inputBg, color: theme.title, borderColor: theme.border}} value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="Paste your transcripts, logs, or raw paragraphs here..." />
              ) : (
                <div style={{...styles.fileDropArea, backgroundColor: theme.bg, borderColor: theme.border}}>
                  <input type="file" accept=".pdf,.txt,.log" onChange={e => setSelectedFile(e.target.files[0])} style={{display:'none'}} id="file-in" />
                  <label htmlFor="file-in" style={{cursor:'pointer', color: theme.title, fontWeight:'600'}}>
                    {selectedFile ? `📂 Selected: ${selectedFile.name}` : '📥 Click here to select a PDF or Text file'}
                  </label>
                </div>
              )}
              
              <div style={{marginTop:'16px'}}>
                <label style={{fontSize: '11px', fontWeight: '700', color: theme.subtext, display: 'block', marginBottom: '6px', textTransform: 'uppercase'}}>Summary Custom Focus</label>
                <select value={processingMode} onChange={e => setProcessingMode(e.target.value)} style={{...styles.selectInput, backgroundColor: theme.inputBg, color: theme.title, borderColor: theme.border}}>
                  <option value="Auto-Detect">Auto-Detect Layout Focus</option>
                  <option value="Technical Documentation">Technical Summary Focus</option>
                  <option value="Action Items Focus">Action Items & Deliverables Focus</option>
                </select>
              </div>

              <button onClick={handleProcessDocument} style={{...styles.primaryBtn, backgroundColor: theme.accent, marginTop:'16px'}}>
                {isProcessing ? 'Processing...' : 'Generate Summary'}
              </button>
            </div>

            <div style={{...styles.workspaceCard, backgroundColor: theme.cardBg, borderColor: theme.border}}>
              
              {!showChatroom ? (
                <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', borderBottom:`1px solid ${theme.border}`, paddingBottom:'8px'}}>
                    <span style={{color: theme.title, fontWeight:'700', fontSize:'15px'}}>Generated Output Layout</span>
                    {summaryOutput && (
                      <div style={{display:'flex', gap:'8px'}}>
                        <button onClick={handleCopyToClipboard} style={{...styles.actionBtn, backgroundColor: theme.bg, color: theme.title, border:`1px solid ${theme.border}`}}>📋 Copy Text</button>
                        <button onClick={handleDownloadPDF} style={{...styles.actionBtn, backgroundColor: theme.primary, color: '#fff'}}>📥 Download PDF</button>
                      </div>
                    )}
                  </div>

                  {summaryOutput && !isProcessing && (
                    <div style={{display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap'}}>
                      <span style={styles.badgePill}>⚡ File Reduced By: {stats.compression}%</span>
                      <span style={styles.badgePill}>⏰ Saved: ~{stats.timeSaved} mins reading time</span>
                      <span style={{...styles.badgePill, backgroundColor: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5', borderColor: 'rgba(79, 70, 229, 0.2)'}}>🏷️ {detectedType}</span>
                    </div>
                  )}

                  {summaryOutput && !isProcessing && speakerDistribution.length > 0 && (
                    <div style={{ marginBottom: '16px', background: isDarkMode ? '#1e293b' : '#f1f5f9', padding: '12px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: theme.title, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>👥 Meeting Speaker Contribution:</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {speakerDistribution.map((speaker, index) => (
                          <div key={index} style={{ fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.text, marginBottom: '2px' }}>
                              <span>{speaker.name}</span>
                              <span style={{ fontWeight: 'bold' }}>{speaker.percentage}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', backgroundColor: isDarkMode ? '#334155' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${speaker.percentage}%`, height: '100%', backgroundColor: theme.accent, borderRadius: '3px' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{...styles.textAreaWrapper, backgroundColor: theme.bg, borderColor: theme.border, color: theme.title}}>
                    {isProcessing ? (
                      <div style={{margin: 'auto', textAlign: 'center'}}>
                        <div style={styles.spinner} />
                        <p style={{fontSize:'13px', marginTop:'12px', color: theme.subtext}}>Reading text and creating summary maps...</p>
                      </div>
                    ) : summaryOutput ? (
                      <div style={{width:'100%', overflowY:'auto'}}>{parseMarkdown(summaryOutput)}</div>
                    ) : (
                      <div style={{margin:'auto', color: theme.subtext, textAlign:'center', fontSize: '13px'}}>Your clean, formatted summary layout will render right here.</div>
                    )}
                  </div>

                  {summaryOutput && !isProcessing && (
                    <button onClick={() => setShowChatroom(true)} style={{...styles.primaryBtn, backgroundColor: theme.primary, marginTop:'12px'}}>
                      💬 Chat with this Document
                    </button>
                  )}
                </div>
              ) : (
                <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px'}}>
                    <span style={{color: theme.title, fontWeight:'700'}}>Document AI Q&A Assistant</span>
                    <button onClick={() => setShowChatroom(false)} style={{...styles.actionBtn, backgroundColor: theme.bg, color: theme.title, border:`1px solid ${theme.border}`}}>📊 Back to Summary</button>
                  </div>

                  <div style={{...styles.chatContainer, backgroundColor: theme.bg, borderColor: theme.border}}>
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} style={{...styles.chatBubble, alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', backgroundColor: msg.role === 'user' ? theme.userMsg : theme.aiMsg}}>
                        <div style={{fontSize:'10px', color: theme.subtext, fontWeight:'bold', marginBottom:'2px'}}>{msg.role === 'user' ? 'YOU' : 'AI ASSISTANT'}</div>
                        <div style={{fontSize:'13px', color: theme.title, lineHeight: '1.4'}}>{msg.content}</div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendChatMessage} style={styles.chatForm}>
                    <input type="text" value={userChatInput} onChange={e => setUserChatInput(e.target.value)} style={{...styles.chatInputText, backgroundColor: theme.bg, color: theme.title, borderColor: theme.border}} placeholder="Ask any target question about the summary details..." />
                    <button type="submit" style={{...styles.chatSendButton, backgroundColor: theme.accent}}>Ask</button>
                  </form>
                </div>
              )}

            </div>

          </div>
        </div>
      </div>

      {showAuthModal && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalBox, backgroundColor: theme.cardBg, borderColor: theme.border}}>
            <h3 style={{color: theme.title, marginBottom:'12px', fontWeight: '700'}}>{isRegisterMode ? 'Create New Account' : 'Login'}</h3>
            <form onSubmit={handleAuthentication} style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              <input type="text" placeholder="Username" onChange={e=>setUsername(e.target.value)} style={{...styles.modalInput, backgroundColor: theme.bg, color: theme.title, borderColor: theme.border}} required />
              {isRegisterMode && (
                <input type="email" placeholder="Email Address" onChange={e=>setEmail(e.target.value)} style={{...styles.modalInput, backgroundColor: theme.bg, color: theme.title, borderColor: theme.border}} required />
              )}
              <input type="password" placeholder="Password" onChange={e=>setPassword(e.target.value)} style={{...styles.modalInput, backgroundColor: theme.bg, color: theme.title, borderColor: theme.border}} required />
              
              {isRegisterMode && (
                <span style={{fontSize:'11px', color: theme.subtext, lineHeight:'1.3'}}>
                  * Password requires ≥6 chars, 1 number, and 1 symbol.
                </span>
              )}

              <button type="submit" style={{...styles.primaryBtn, backgroundColor: theme.accent}}>Submit</button>
            </form>
            <button onClick={() => setIsRegisterMode(!isRegisterMode)} style={{background:'none', border:'none', color:'#4f46e5', marginTop:'10px', cursor:'pointer', fontSize:'12px', fontWeight: '600'}}>
              {isRegisterMode ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </button>
            <button onClick={()=>setShowAuthModal(false)} style={{...styles.secondaryBtn, width:'100%', marginTop:'10px', color: theme.title, backgroundColor: theme.bg, borderColor: theme.border}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  appFrame: { minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' },
  navbar: { display: 'flex', justifyContent: 'space-between', alignItems:'center', padding: '12px 24px', borderBottom: '1px solid' },
  logo: { fontWeight: '700', fontSize: '16px' },
  primaryBtn: { color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize:'13px' },
  secondaryBtn: { padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight:'600', fontSize:'12px', background: 'none', border: '1px solid' },
  actionBtn: { padding: '5px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:'600', border:'none' },
  sidebar: { overflowY: 'auto', borderRight: '1px solid', transition: 'width 0.15s ease, opacity 0.1s' },
  historyCard: { padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize:'13px', border:'1px solid', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' },
  mainCanvas: { flex: 1, padding: '16px', overflow:'hidden', display: 'flex' },
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', width: '100%', height: '100%' },
  workspaceCard: { border: '1px solid', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', overflow:'hidden' },
  tabBar: { display: 'flex', gap: '16px', marginBottom: '12px' },
  tabBtn: { background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize:'13px', paddingBottom:'6px' },
  fileDropArea: { border:'2px dashed', borderRadius:'6px', padding:'40px 16px', textAlign:'center', flex:1, display:'flex', alignItems:'center', justifyContent:'center' },
  selectInput: { width:'100%', padding:'8px', borderRadius:'6px', outline:'none', fontSize:'13px' },
  textAreaWrapper: { flex: 1, display: 'flex', border: '1px solid', borderRadius: '6px', padding: '12px', overflowY:'auto' },
  pureTextarea: { width: '100%', flex: 1, border: '1px solid', borderRadius:'6px', outline: 'none', resize: 'none', padding:'10px', fontSize:'13px' },
  badgePill: { padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.15)' },
  
  chatContainer: { flex: 1, border: '1px solid', borderRadius: '6px', padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  chatBubble: { padding: '8px 12px', borderRadius: '8px', maxWidth: '85%' },
  chatForm: { display: 'flex', gap: '8px', marginTop: '12px' },
  chatInputText: { flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid', outline: 'none', fontSize: '13px' },
  chatSendButton: { border: 'none', color: '#fff', padding: '0 14px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize:'12px' },
  
  spinner: { width:'24px', height:'24px', border:'3px solid rgba(0,0,0,0.1)', borderTop:'3px solid #10b981', borderRadius:'50%', display:'inline-block' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalBox: { width: '280px', padding: '20px', borderRadius: '8px', border: '1px solid', display:'flex', flexDirection:'column' },
  modalInput: { padding: '8px', borderRadius: '6px', border: '1px solid', outline: 'none', fontSize: '13px' }
};

export default App;