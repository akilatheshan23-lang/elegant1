import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { 
  LayoutDashboard, Mail, RefreshCw, AlertCircle, CheckCircle2, 
  Clock, Trash2, Search, Copy, Plus, Database, Sparkles, 
  Smile, Meh, Frown, ChevronRight, Check, Info
} from 'lucide-react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const cleanEmailBody = (body) => {
  if (!body) return '';
  
  // Clean common email quotation headers
  const quoteHeaders = [
    /On\s+.*wrote:/i,
    /----------\s*Forwarded\s+message\s*----------/i,
    /-----Original Message-----/i,
    /From:\s*/i,
  ];
  
  let cleaned = body;
  for (const regex of quoteHeaders) {
    const parts = cleaned.split(regex);
    if (parts.length > 0) {
      cleaned = parts[0];
    }
  }
  
  // Filter out lines starting with >
  const lines = cleaned.split('\n');
  const filteredLines = lines.filter(line => !line.trim().startsWith('>'));
  
  return filteredLines.join('\n').trim();
};

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Ref for messages container auto-scroll
  const chatContainerRef = useRef(null);
  
  // Custom Toast Notifications
  const [notifications, setNotifications] = useState([]);

  const showNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, type }]);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  };
  
  // Data State
  const [analytics, setAnalytics] = useState(null);
  const [threads, setThreads] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [copiedTextId, setCopiedTextId] = useState(null);
  const [inboxFilter, setInboxFilter] = useState('business'); // 'all' | 'business' | 'pending' | 'responded'
  const [accountFilter, setAccountFilter] = useState('all'); // 'all' | 'email@address'

  const currentThread = threads.find(t => t.threadId === selectedThreadId);
  const currentMessageCount = currentThread ? currentThread.emails.length : 0;

  // Auto scroll to bottom when thread or message list updates
  useEffect(() => {
    const scrollToBottom = () => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    };

    // Phase 1: Scroll immediately
    scrollToBottom();

    // Phase 2: Scroll after browser reflow and DOM paint (resolves async layout size updates)
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [selectedThreadId, currentMessageCount]);

  // OAuth landing states
  const [isOAuthCallback, setIsOAuthCallback] = useState(false);
  const [oauthStatus, setOauthStatus] = useState(null); // 'success' or 'error'
  const [oauthEmail, setOauthEmail] = useState('');
  const [oauthErrorDetails, setOauthErrorDetails] = useState('');

  // Parse URL Parameters (for OAuth redirects)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setIsOAuthCallback(true);
      setOauthStatus('success');
      setOauthEmail(params.get('email') || '');
      showNotification(`Successfully connected Gmail account: ${params.get('email')}`, 'success');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('error')) {
      setIsOAuthCallback(true);
      setOauthStatus('error');
      setOauthErrorDetails(`${params.get('error')}. ${params.get('details') || ''}`);
      showNotification(`Authentication Failed: ${params.get('error')}. ${params.get('details') || ''}`, 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch all dashboard data
  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [analyticsRes, threadsRes, accountsRes] = await Promise.all([
        axios.get(`${API_BASE}/analytics`),
        axios.get(`${API_BASE}/emails/threads`),
        axios.get(`${API_BASE}/auth/accounts`)
      ]);
      
      setAnalytics(analyticsRes.data);
      setThreads(threadsRes.data);
      setAccounts(accountsRes.data);

      // Auto-select first thread if none is selected
      if (threadsRes.data.length > 0) {
        setSelectedThreadId(prev => prev ? prev : threadsRes.data[0].threadId);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Automatically check for new synced emails silently every 2 seconds for very fast updates
    const interval = setInterval(() => {
      fetchData(false);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Sync Emails handler
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API_BASE}/emails/sync`);
      const results = res.data.results || [];
      const successes = results.filter(r => r.success);
      const errors = results.filter(r => !r.success);
      
      let msg = `Sync complete.`;
      if (successes.length > 0) {
        msg += ` Synced ${successes.length} accounts.`;
      }
      if (errors.length > 0) {
        msg += ` Failed to sync ${errors.length} accounts.`;
      }
      showNotification(msg, successes.length > 0 ? 'success' : 'error');
      await fetchData(false);
    } catch (err) {
      console.error('Error syncing emails:', err);
      showNotification('Failed to trigger email sync. Verify backend server status.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Connect Google Gmail account
  const handleConnectGmail = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/google/url`);
      if (res.data && res.data.url) {
        // Open Google Consent Page in a new tab
        window.open(res.data.url, '_blank');
      } else {
        showNotification('Could not retrieve authentication URL.', 'error');
      }
    } catch (err) {
      console.error('Error getting OAuth URL:', err);
      showNotification('OAuth failed. Verify Google API client keys in backend .env.', 'error');
    }
  };

  // Delete/Disconnect connected account
  const handleDisconnectAccount = async (email) => {
    if (!window.confirm(`Are you sure you want to disconnect ${email}?`)) return;
    try {
      await axios.delete(`${API_BASE}/auth/accounts/${encodeURIComponent(email)}`);
      showNotification(`Successfully disconnected ${email}.`, 'success');
      await fetchData(false);
    } catch (err) {
      console.error('Error disconnecting account:', err);
      showNotification('Failed to disconnect account.', 'error');
    }
  };

  // Generate demo data
  const handleGenerateDemoData = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/emails/mock`);
      showNotification(res.data.message || 'Mock data generated successfully!', 'success');
      await fetchData(true);
    } catch (err) {
      console.error('Error generating demo data:', err);
      showNotification('Failed to generate mock data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Manually mark email thread as responded
  const handleMarkAsResponded = async (threadId) => {
    try {
      await axios.post(`${API_BASE}/emails/threads/${threadId}/respond`);
      showNotification('Thread manually marked as responded.', 'success');
      await fetchData(false);
    } catch (err) {
      console.error('Error marking thread as responded:', err);
      showNotification('Failed to update status: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  // Copy Suggested Reply to Clipboard
  const handleCopyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedTextId(id);
    setTimeout(() => setCopiedTextId(null), 2000);
  };

  // Format date helper
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRelativeTime = (dateStr) => {
    const now = new Date();
    const past = new Date(dateStr);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${diffDays}d ago`;
  };

  const formatDuration = (totalMinutes) => {
    if (totalMinutes === undefined || totalMinutes === null) return 'N/A';
    if (totalMinutes < 60) return `${Math.round(totalMinutes)}m`;
    if (totalMinutes < 1440) {
      const hrs = Math.floor(totalMinutes / 60);
      const mins = Math.round(totalMinutes % 60);
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    const days = Math.floor(totalMinutes / 1440);
    const hrs = Math.floor((totalMinutes % 1440) / 60);
    return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
  };

  // Render Badges
  const renderMoodBadge = (mood) => {
    switch (mood) {
      case 'Happy':
        return <span className="badge badge-happy"><Smile size={14} /> Happy</span>;
      case 'Angry':
        return <span className="badge badge-angry"><Frown size={14} /> Angry</span>;
      default:
        return <span className="badge badge-neutral"><Meh size={14} /> Neutral</span>;
    }
  };

  const renderPriorityBadge = (priority) => {
    switch (priority) {
      case 'High':
        return <span className="badge badge-high">High</span>;
      case 'Medium':
        return <span className="badge badge-medium">Medium</span>;
      default:
        return <span className="badge badge-low">Low</span>;
    }
  };

  const renderStatusBadge = (status) => {
    if (status === 'Responded') {
      return <span className="badge badge-responded"><CheckCircle2 size={12} /> Responded</span>;
    }
    return <span className="badge badge-pending"><Clock size={12} /> Pending</span>;
  };

  const renderMessageTypeBadge = (type) => {
    if (!type) return null;
    let className = 'badge-type-inquiry';
    if (type === 'Production Update') {
      className = 'badge-type-production';
    } else if (type === 'Image & Sample Approval') {
      className = 'badge-type-approval';
    }
    return <span className={`badge ${className}`}>{type}</span>;
  };

  // Known spam/marketing domains to hide from business view
  const SPAM_DOMAINS = [
    'linkedin.com', 'temu.com', 'temuemail.com', 'alison.com', 'mongodb.com',
    'draytek.com', 'smartlead.ai', 'google.com', 'accounts.google.com',
    'noreply-accounts@google.com', 'google-noreply@google.com', 'bocdigibank@boc.lk',
    'updates-noreply@linkedin.com', 'noreply@us-courses.alison.com', 'mongodb@team.mongodb.com',
    'mongodb-atlas@mongodb.com', 'no-reply@accounts.google.com', 'commerce.temuemail.com',
  ];

  const isBusinessEmail = (sender) => {
    const lower = (sender || '').toLowerCase();
    return !SPAM_DOMAINS.some(domain => lower.includes(domain));
  };

  // Delete an entire thread
  const handleDeleteThread = async (e, threadId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this entire conversation?')) return;
    try {
      await axios.delete(`${API_BASE}/emails/threads/${threadId}`);
      setThreads(prev => prev.filter(t => t.threadId !== threadId));
      if (selectedThreadId === threadId) setSelectedThreadId(null);
      showNotification('Conversation deleted.', 'success');
    } catch (err) {
      showNotification('Failed to delete conversation.', 'error');
    }
  };

  // Filter threads based on Search Input + Inbox Filter tab + Account Filter
  const filteredThreads = threads.filter(t => {
    // 1. Account filter
    if (accountFilter !== 'all') {
      const matchEmail = accountFilter.toLowerCase();
      const inSender = t.sender.toLowerCase().includes(matchEmail);
      const inReceiver = t.receiver.toLowerCase().includes(matchEmail);
      if (!inSender && !inReceiver) return false;
    }

    // 2. Search filter
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      t.sender.toLowerCase().includes(query) ||
      t.subject.toLowerCase().includes(query) ||
      t.emails.some(e => e.body.toLowerCase().includes(query))
    );
    if (!matchesSearch) return false;

    // 3. Status/Spam filter
    const lastStatus = t.emails[t.emails.length - 1]?.status;
    if (inboxFilter === 'business') return isBusinessEmail(t.sender);
    if (inboxFilter === 'pending') return lastStatus === 'Pending' && isBusinessEmail(t.sender);
    if (inboxFilter === 'responded') return lastStatus === 'Responded' && isBusinessEmail(t.sender);
    return true; // 'all'
  });

  if (isOAuthCallback) {
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1.5rem', padding: '2rem', textAlign: 'center', backgroundColor: '#0a0f1d' }}>
        {oauthStatus === 'success' ? (
          <div className="glass" style={{ padding: '3rem', borderRadius: '16px', maxWidth: '500px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <CheckCircle2 size={48} />
            </div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff' }}>Connection Successful!</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>
              Gmail account <strong>{oauthEmail}</strong> has been linked successfully.
            </p>
          </div>
        ) : (
          <div className="glass" style={{ padding: '3rem', borderRadius: '16px', maxWidth: '500px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
              <AlertCircle size={48} />
            </div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff' }}>Connection Failed</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>
              {oauthErrorDetails || 'An error occurred during authentication.'}
            </p>
          </div>
        )}
        <button className="btn btn-primary" onClick={() => window.close()} style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600 }}>
          Close Tab & Return
        </button>
        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
          You can safely close this browser window now.
        </p>
      </div>
    );
  }

  const selectedThread = threads.find(t => t.threadId === selectedThreadId);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-section" style={{ display: 'flex', justifyContent: 'center', padding: '1rem 1.5rem' }}>
          <img src="/logo.png" alt="Elegant Knitting International" style={{ maxWidth: '100%', height: 'auto', maxHeight: '55px', objectFit: 'contain' }} />
        </div>

        <nav className="nav-menu">
          <div 
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={20} />
            Overview Dashboard
          </div>
          <div 
            className={`nav-item ${activeTab === 'inbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('inbox')}
          >
            <Mail size={20} />
            Customer Inbox
            {analytics?.summary?.pendingEmails > 0 && (
              <span className="badge badge-high" style={{ marginLeft: 'auto', padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>
                {analytics.summary.pendingEmails}
              </span>
            )}
          </div>
          <div 
            className={`nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('integrations')}
          >
            <Database size={20} />
            Connected Accounts
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="footer-connection">
            <span className={`status-indicator ${accounts.length > 0 ? 'status-active' : 'status-idle'}`} />
            <span>{accounts.length} Accounts Connected</span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main-content">
        {/* Header/Top Bar */}
        <header className="top-bar">
          <div className="top-bar-title">
            <h1>
              {activeTab === 'overview' && 'Overview Analytics'}
              {activeTab === 'inbox' && 'Merchandiser Inbox Monitor'}
              {activeTab === 'integrations' && 'Gmail API Connections'}
            </h1>
          </div>
          
          <div className="top-bar-actions">
            {accounts.length === 0 && (
              <button className="btn btn-secondary" onClick={handleGenerateDemoData} disabled={loading}>
                <Sparkles size={16} />
                Generate Demo Data
              </button>
            )}
            <button 
              className={`btn btn-primary ${syncing ? 'animate-pulse' : ''}`} 
              onClick={handleSync}
              disabled={syncing || accounts.length === 0}
            >
              <RefreshCw size={16} className={syncing ? 'spinner' : ''} />
              {syncing ? 'Syncing Gmail...' : 'Sync Mailbox'}
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="content-body" style={{ padding: activeTab === 'inbox' ? '0' : '2rem' }}>
          {loading ? (
            <div className="loading-overlay">
              <div className="spinner" />
              <p>Fetching metrics from MERN server...</p>
            </div>
          ) : !analytics ? (
            <div className="glass empty-state" style={{ margin: '2rem auto', maxWidth: '600px', background: 'rgba(19, 27, 46, 0.7)' }}>
              <AlertCircle size={48} className="empty-icon" style={{ color: 'var(--color-danger)' }} />
              <h2>MERN Server Offline</h2>
              <p style={{ maxWidth: '400px' }}>
                Could not retrieve dashboard statistics. Ensure your backend server is running and connected to MongoDB.
              </p>
              <button className="btn btn-primary" onClick={() => fetchData(true)} style={{ marginTop: '1rem' }}>
                <RefreshCw size={14} /> Retry Connection
              </button>
            </div>
          ) : activeTab === 'overview' ? (
            /* Overview Tab */
            <>
              {/* Stats KPI Cards */}
              <div className="stats-grid">
                <div className="stat-card glass glass-hover">
                  <div className="stat-info">
                    <h3>Total Inquiries</h3>
                    <p>{analytics?.summary?.totalEmails || 0}</p>
                  </div>
                  <div className="stat-icon-wrapper">
                    <Mail size={24} />
                  </div>
                </div>

                <div className="stat-card glass glass-hover">
                  <div className="stat-info">
                    <h3>Avg Response Time</h3>
                    <p>{formatDuration(analytics?.summary?.avgResponseTime) || '0m'}</p>
                  </div>
                  <div className="stat-icon-wrapper" style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                    <Clock size={24} />
                  </div>
                </div>

                <div className="stat-card glass glass-hover">
                  <div className="stat-info">
                    <h3>Response Rate</h3>
                    <p>{analytics?.summary?.responseRate || 0}%</p>
                  </div>
                  <div className="stat-icon-wrapper" style={{ color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                    <CheckCircle2 size={24} />
                  </div>
                </div>

                <div className="stat-card glass glass-hover">
                  <div className="stat-info">
                    <h3>Pending Action</h3>
                    <p>{analytics?.summary?.pendingEmails || 0}</p>
                  </div>
                  <div className="stat-icon-wrapper" style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                    <AlertCircle size={24} />
                  </div>
                </div>
              </div>

              {/* Charts Sections */}
              {analytics?.summary?.totalEmails > 0 ? (
                <>
                  <div className="charts-grid">
                    {/* Area Chart: Volume Trend */}
                    <div className="chart-card glass">
                      <h2>Weekly Email Volume Trend</h2>
                      <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={analytics.volumeTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorEmails" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorResponded" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#283554" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                            <YAxis stroke="#94a3b8" fontSize={11} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#131b2e', borderColor: '#283554', color: '#ffffff', borderRadius: '8px' }} 
                              itemStyle={{ color: '#ffffff' }}
                              labelStyle={{ color: '#ffffff' }}
                            />
                            <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                            <Area type="monotone" dataKey="emails" name="Received Emails" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEmails)" />
                            <Area type="monotone" dataKey="responded" name="Responded" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorResponded)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Pie Chart: Sentiment / Mood Breakdown */}
                    <div className="chart-card glass">
                      <h2>Customer Sentiment (Mood)</h2>
                      <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analytics.sentiment.filter(s => s.value > 0)}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {analytics.sentiment.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#131b2e', borderColor: '#283554', color: '#ffffff', borderRadius: '8px' }} 
                              itemStyle={{ color: '#ffffff' }}
                              labelStyle={{ color: '#ffffff' }}
                            />
                            <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="charts-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                    {/* Bar Chart: Priority levels */}
                    <div className="chart-card glass">
                      <h2>Priority Breakdown</h2>
                      <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.priority} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#283554" />
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                            <YAxis stroke="#94a3b8" fontSize={11} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#131b2e', borderColor: '#283554', color: '#ffffff', borderRadius: '8px' }} 
                              itemStyle={{ color: '#ffffff' }}
                              labelStyle={{ color: '#ffffff' }}
                            />
                            <Bar dataKey="value" name="Emails" radius={[4, 4, 0, 0]}>
                              {analytics.priority.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Merchandiser Response Leaderboard */}
                    <div className="table-card glass">
                      <h2>Merchandiser Performance Leaderboard</h2>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="custom-table">
                          <thead>
                            <tr>
                              <th>Merchandiser</th>
                              <th>Assigned</th>
                              <th>Responded</th>
                              <th>Pending</th>
                              <th>Response Rate</th>
                              <th>Avg Response Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.leaderboard.length > 0 ? (
                              analytics.leaderboard.map((m, idx) => (
                                <tr key={idx}>
                                  <td style={{ fontWeight: 600 }}>{m.email}</td>
                                  <td>{m.total}</td>
                                  <td style={{ color: '#10b981' }}>{m.responded}</td>
                                  <td style={{ color: '#f59e0b' }}>{m.pending}</td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span>{m.responseRate}%</span>
                                      <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', width: '50px' }}>
                                        <div style={{ height: '100%', background: '#3b82f6', width: `${m.responseRate}%`, borderRadius: '2px' }} />
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ fontWeight: 500 }}>{formatDuration(m.avgResponseTime)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>
                                  No merchandiser performance data compiled yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Empty state when no data exists */
                <div className="glass empty-state" style={{ marginTop: '2rem' }}>
                  <Mail className="empty-icon animate-pulse" size={48} />
                  <h2>No Email Conversations Yet</h2>
                  <p style={{ maxWidth: '450px' }}>
                    Connect a merchandiser Gmail account or generate simulated live-demo metrics to populate the dashboard analytics.
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button className="btn btn-primary" onClick={() => setActiveTab('integrations')}>
                      Connect Gmail Account
                    </button>
                    <button className="btn btn-secondary" onClick={handleGenerateDemoData}>
                      Generate Demo Data
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : activeTab === 'inbox' ? (
            /* Inbox Tab */
            <div className="inbox-container">
              {/* Left sidebar containing threads list */}
              <div className="threads-sidebar">
                <div className="search-wrapper">
                  <input 
                    type="text" 
                    className="search-input" 
                    placeholder="Search sender, subject, content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Account Filter Dropdown */}
                {accounts.length > 0 && (
                  <div style={{ padding: '0 12px 8px' }}>
                    <select 
                      value={accountFilter}
                      onChange={(e) => setAccountFilter(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(19, 27, 46, 0.8)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="all">All Merchandiser Inboxes</option>
                      {accounts.map(acc => (
                        <option key={acc.email} value={acc.email}>
                          Inbox: {acc.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Filter Tabs */}
                <div className="inbox-filter-tabs">
                  {['business', 'all', 'pending', 'responded'].map(tab => (
                    <button
                      key={tab}
                      className={`filter-tab ${inboxFilter === tab ? 'active' : ''}`}
                      onClick={() => setInboxFilter(tab)}
                    >
                      {tab === 'business' ? '🏢 Business' :
                       tab === 'all' ? '📬 All' :
                       tab === 'pending' ? '⏳ Pending' : '✅ Done'}
                    </button>
                  ))}
                </div>

                <div className="threads-list">
                  {filteredThreads.length > 0 ? (
                    filteredThreads.map(t => (
                      <div 
                        key={t.threadId}
                        className={`thread-item ${selectedThreadId === t.threadId ? 'active' : ''}`}
                        onClick={() => setSelectedThreadId(t.threadId)}
                      >
                        <div className="thread-header">
                          <span className="thread-sender">{t.sender.split(' <')[0]}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="thread-time">{getRelativeTime(t.lastReceived)}</span>
                            <button
                              className="thread-delete-btn"
                              title="Delete conversation"
                              onClick={(e) => handleDeleteThread(e, t.threadId)}
                            >✕</button>
                          </div>
                        </div>
                        <div className="thread-subject">{t.subject}</div>
                        <div className="thread-badges">
                          {renderMoodBadge(t.dominantMood)}
                          {renderPriorityBadge(t.highestPriority)}
                          {renderStatusBadge(t.emails[t.emails.length - 1].status)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                      No matching threads found.
                    </div>
                  )}
                </div>
              </div>

              {/* Right pane detailing the selected thread */}
              <div className="detail-pane">
                {selectedThread ? (
                  <>
                    {/* Thread Header */}
                    <div className="detail-header">
                      <div className="detail-subject">{selectedThread.subject}</div>
                      <div className="detail-metadata">
                        <div className="metadata-left">
                          <div className="metadata-row">
                            From: <span>{selectedThread.sender}</span>
                          </div>
                          <div className="metadata-row">
                            Assigned Merchandiser: <span>{selectedThread.receiver}</span>
                          </div>
                        </div>
                        <div className="thread-badges" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {renderMoodBadge(selectedThread.dominantMood)}
                          {renderPriorityBadge(selectedThread.highestPriority)}
                          {renderMessageTypeBadge(selectedThread.messageType)}

                        </div>
                      </div>
                    </div>

                    {/* Conversation Body */}
                    <div ref={chatContainerRef} className="detail-body-wrapper">
                      {/* AI Widgets: Summary & Response */}
                      {selectedThread.emails[selectedThread.emails.length - 1].summary && (
                        <div className="ai-summary-card">
                          <div className="ai-card-title">
                            <Sparkles size={14} />
                            Elegant AI Incident Summary
                          </div>
                          <p style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>
                            {selectedThread.emails[selectedThread.emails.length - 1].summary}
                          </p>
                        </div>
                      )}

                      {selectedThread.emails[selectedThread.emails.length - 1].status === 'Pending' && 
                       selectedThread.emails[selectedThread.emails.length - 1].suggestedReply && (
                        <div className="ai-suggested-reply">
                          <div className="ai-card-title">
                            <Sparkles size={14} />
                            Recommended Response Draft
                          </div>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                            Quickly draft a response using Elegant AI's tailor-made proposal.
                          </p>
                          <div className="reply-text-box">
                            {selectedThread.emails[selectedThread.emails.length - 1].suggestedReply}
                          </div>
                          <div className="reply-actions">
                            <button 
                              className="btn btn-primary"
                              onClick={() => handleCopyToClipboard(
                                selectedThread.emails[selectedThread.emails.length - 1].suggestedReply, 
                                selectedThread.threadId
                              )}
                              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                            >
                              {copiedTextId === selectedThread.threadId ? (
                                <>
                                  <Check size={14} />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy size={14} />
                                  Copy Response
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Display Emails list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                          Email History ({selectedThread.emails.length} message{selectedThread.emails.length > 1 ? 's' : ''})
                        </div>
                        {selectedThread.emails.map(email => {
                          const cleanSender = email.sender.match(/<([^>]+)>/) ? email.sender.match(/<([^>]+)>/)[1].trim().toLowerCase() : email.sender.trim().toLowerCase();
                          const cleanReceiver = selectedThread.receiver.match(/<([^>]+)>/) ? selectedThread.receiver.match(/<([^>]+)>/)[1].trim().toLowerCase() : selectedThread.receiver.trim().toLowerCase();
                          const isReply = cleanSender === cleanReceiver || accounts.some(acc => {
                            const cleanAcc = acc.email.match(/<([^>]+)>/) ? acc.email.match(/<([^>]+)>/)[1].trim().toLowerCase() : acc.email.trim().toLowerCase();
                            return cleanAcc === cleanSender;
                          });
                          return (
                            <div key={email._id || email.messageId} className={`message-bubble ${isReply ? 'reply-bubble' : 'customer-bubble'}`}>
                              <div className="bubble-header">
                                <span className="bubble-sender" style={{ color: isReply ? '#60a5fa' : 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  {isReply ? `⭐ Merchandiser (${email.sender.split(' <')[0]})` : email.sender}
                                  <span style={{ fontSize: '0.75rem', opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.4rem', background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                    {email.mood === 'Happy' ? '😀 Happy' : email.mood === 'Angry' ? '😡 Angry' : '😐 Neutral'}
                                  </span>
                                </span>
                                <span>{formatDate(email.receivedAt)}</span>
                              </div>
                              <div className="bubble-content" style={{ whiteSpace: 'pre-wrap' }}>{cleanEmailBody(email.body)}</div>
                              {email.status === 'Responded' && email.responseTime && !isReply && (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem', padding: '0.5rem 1rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', borderRadius: '8px', width: 'fit-content' }}>
                                  <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 500 }}>
                                    Responded (Turnaround time: {formatDuration(email.responseTime)})
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <Mail className="empty-icon animate-pulse" size={48} />
                    <h2>Select an Email Thread</h2>
                    <p>Select a message thread from the listing to examine customer inquiry and generate automated Elegant AI responses.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Connected Accounts Tab */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Active Merchandiser Credentials</h2>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Manage merchandiser email address delegations configured for automatic monitoring.
                  </p>
                </div>
                <button className="btn btn-primary" onClick={handleConnectGmail}>
                  <Plus size={16} />
                  Authorize Gmail Account
                </button>
              </div>

              {accounts.length > 0 ? (
                <div className="accounts-grid">
                  {accounts.map(acc => (
                    <div key={acc._id} className="account-card glass glass-hover">
                      <div className="account-card-header">
                        <div>
                          <div className="account-email">{acc.email}</div>
                          <div className="account-provider">Google Gmail Client</div>
                        </div>
                        <span className={`badge ${acc.status === 'active' ? 'badge-happy' : 'badge-angry'}`}>
                          {acc.status === 'active' ? 'Active' : 'Expired'}
                        </span>
                      </div>

                      <div className="account-details">
                        <div>Last Synced: {acc.lastSync ? formatDate(acc.lastSync) : 'Never'}</div>
                        <div>Connected on: {formatDate(acc.createdAt)}</div>
                      </div>

                      <div className="account-actions">
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleDisconnectAccount(acc.email)}
                          style={{ borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        >
                          <Trash2 size={14} />
                          Disconnect
                        </button>
                        
                        {acc.lastSync && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <CheckCircle2 size={12} style={{ color: '#10b981' }} />
                            Polled headlessly
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="glass empty-state">
                  <Database size={48} className="empty-icon" />
                  <h2>No Gmail Connections Setup</h2>
                  <p style={{ maxWidth: '400px' }}>
                    You have not registered any merchandiser Gmail inbox. Autorize an account using Google OAuth to sync emails.
                  </p>
                  <button className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={handleConnectGmail}>
                    Connect Gmail Account
                  </button>
                </div>
              )}


            </>
          )}
        </div>
      </main>

      {/* Custom Toast Notifications */}
      <div className="toast-container">
        {notifications.map(n => (
          <div key={n.id} className={`toast-card toast-${n.type} btn-animate`}>
            <div className="toast-icon">
              {n.type === 'success' && <CheckCircle2 size={18} />}
              {n.type === 'error' && <AlertCircle size={18} />}
              {n.type === 'info' && <Info size={18} />}
            </div>
            <div className="toast-message">{n.message}</div>
            <button className="toast-close" onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}>&times;</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
