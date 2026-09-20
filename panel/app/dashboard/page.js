'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, upload, clearToken, streamLogs } from '../lib/api';

export default function Dashboard() {
  const [bots, setBots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [files, setFiles] = useState([]);
  const [cwd, setCwd] = useState('');
  const [editing, setEditing] = useState(null);
  const [content, setContent] = useState('');
  const [logs, setLogs] = useState('');
  const [newBot, setNewBot] = useState('');
  const [toast, setToast] = useState('');
  const [live, setLive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const router = useRouter();
  const esRef = useRef(null);
  const logsRef = useRef(null);

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500); }

  async function loadBots() {
    const data = await api('/api/bots');
    setBots(Array.isArray(data) ? data : []);
  }

  async function loadFiles(bot, sub = '') {
    const data = await api(`/api/bots/${bot}/files?path=${encodeURIComponent(sub)}`);
    setFiles(Array.isArray(data) ? data : []);
    setCwd(sub);
  }

  async function openBot(name) {
    if (esRef.current) esRef.current.close();
    setSelected(name);
    setEditing(null); setLogs(''); setLive(false);
    await loadFiles(name);
    startLogStream(name);
    loadBots();
  }

  function startLogStream(name) {
    try {
      const es = streamLogs(name, (data) => {
        setLogs(prev => (prev + data).slice(-30000));
        setTimeout(() => {
          if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }, 20);
      });
      esRef.current = es;
      setLive(true);
    } catch { setLive(false); }
  }

  async function openFile(item) {
    if (item.isDir) { await loadFiles(selected, item.path); return; }
    const data = await api(`/api/bots/${selected}/file?path=${encodeURIComponent(item.path)}`);
    setEditing(item.path);
    setContent(data.content || '');
  }

  async function saveFile() {
    await api(`/api/bots/${selected}/file`, {
      method: 'POST',
      body: JSON.stringify({ path: editing, content }),
    });
    flash('File saved');
  }

  async function newFile() {
    const name = prompt('New file name:');
    if (!name) return;
    const filePath = cwd ? `${cwd}/${name}` : name;
    await api(`/api/bots/${selected}/file`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath, content: '' }),
    });
    loadFiles(selected, cwd);
    flash('File created');
  }

  async function deleteFile(item) {
    if (!confirm(`Delete ${item.name}?`)) return;
    await api(`/api/bots/${selected}/file?path=${encodeURIComponent(item.path)}`, {
      method: 'DELETE',
    });
    loadFiles(selected, cwd);
    flash('Deleted');
  }

  async function renameFile(item) {
    const to = prompt('Rename to:', item.name);
    if (!to || to === item.name) return;
    const dir = cwd ? `${cwd}/` : '';
    await api(`/api/bots/${selected}/rename`, {
      method: 'POST',
      body: JSON.stringify({ from: item.path, to: dir + to }),
    });
    loadFiles(selected, cwd);
    flash('Renamed');
  }

  async function toggleFile(item) {
    await api(`/api/bots/${selected}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ filePath: item.path }),
    });
    loadFiles(selected, cwd);
  }

  async function createBot() {
    if (!newBot) return;
    const res = await api('/api/bots', {
      method: 'POST', body: JSON.stringify({ name: newBot }),
    });
    if (res.error) return flash(res.error);
    setNewBot(''); loadBots();
    flash('Bot created');
  }

  async function deleteBot(name) {
    if (!confirm(`Delete bot "${name}" and all files?`)) return;
    await api(`/api/bots/${name}`, { method: 'DELETE' });
    if (selected === name) setSelected(null);
    loadBots();
    flash('Bot deleted');
  }

  async function action(cmd) {
    flash(`${cmd}...`);
    const res = await api(`/api/bots/${selected}/${cmd}`, { method: 'POST' });
    if (res.error) flash('Error: ' + res.error);
    else flash(`${cmd} ok`);
    loadBots();
  }

  async function handleUpload(e) {
    const fl = e.target.files;
    if (!fl.length) return;
    const fd = new FormData();
    for (const f of fl) fd.append('files', f);
    fd.append('path', cwd);
    await upload(`/api/bots/${selected}/upload`, fd);
    flash('Uploaded');
    loadFiles(selected, cwd);
    e.target.value = '';
  }

  function logout() {
    if (esRef.current) esRef.current.close();
    clearToken();
    router.push('/');
  }

  function uptimeText(ms) {
    if (!ms) return '-';
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  useEffect(() => { loadBots(); }, []);
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(loadBots, 10000);
    return () => clearInterval(t);
  }, [selected]);
  useEffect(() => () => { if (esRef.current) esRef.current.close(); }, []);

  const currentBot = bots.find(b => b.name === selected);

  return (
    <>
      <div className="header">
        <h1><i className="fas fa-server" /> VPS Bot Panel</h1>
        <div>
          <button onClick={loadBots}><i className="fas fa-sync-alt" /> Refresh</button>
          <button onClick={() => setShowSettings(!showSettings)}>
            <i className="fas fa-cog" /> Settings
          </button>
          <button className="danger" onClick={logout}>
            <i className="fas fa-sign-out-alt" /> Logout
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="container">
        {showSettings && (
          <div className="card">
            <h2><i className="fas fa-sliders-h" /> Panel Settings</h2>
            <div className="stat-grid">
              <div className="stat">
                <div className="val">{bots.length} / 5</div>
                <div className="lbl">Bots Used</div>
              </div>
              <div className="stat">
                <div className="val">{bots.filter(b => b.status === 'online').length}</div>
                <div className="lbl">Running</div>
              </div>
              <div className="stat">
                <div className="val">{bots.filter(b => b.status !== 'online').length}</div>
                <div className="lbl">Stopped</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid">
          {/* COLUMN 1: BOTS */}
          <div>
            <div className="card">
              <h2><i className="fas fa-robot" /> Bots</h2>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input placeholder="New bot name"
                  value={newBot} onChange={e => setNewBot(e.target.value)}
                  disabled={bots.length >= 5} />
                <button className="primary" onClick={createBot}
                  disabled={bots.length >= 5 || !newBot}>
                  <i className="fas fa-plus" />
                </button>
              </div>
              {bots.map(b => (
                <div key={b.name}
                  className={`bot-item ${selected === b.name ? 'active' : ''}`}
                  onClick={() => openBot(b.name)}>
                  <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fas fa-circle"
                      style={{ color: b.status === 'online' ? '#1a7f37' : '#8b949e', fontSize: 9 }} />
                    {b.name}
                  </span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span className={`badge ${b.status === 'online' ? 'online' : 'stopped'}`}>
                      {b.status}
                    </span>
                    <button className="danger icon-btn"
                      onClick={e => { e.stopPropagation(); deleteBot(b.name); }}>
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {currentBot && (
              <div className="card">
                <h2><i className="fas fa-microchip" /> Resources</h2>
                <div className="stat-grid">
                  <div className="stat">
                    <div className="val">{currentBot.cpu?.toFixed?.(1) ?? 0}%</div>
                    <div className="lbl">CPU</div>
                  </div>
                  <div className="stat">
                    <div className="val">{((currentBot.memory || 0) / 1048576).toFixed(0)} MB</div>
                    <div className="lbl">RAM</div>
                  </div>
                  <div className="stat">
                    <div className="val">{uptimeText(currentBot.uptime)}</div>
                    <div className="lbl">Uptime</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 2: FILES */}
          {selected && (
            <div>
              <div className="card">
                <h2><i className="fas fa-folder-open" /> Files — /{cwd}</h2>
                <div className="toolbar">
                  {cwd && (
                    <button onClick={() => {
                      const parts = cwd.split('/'); parts.pop();
                      loadFiles(selected, parts.join('/'));
                    }}>
                      <i className="fas fa-arrow-up" /> Up
                    </button>
                  )}
                  <button onClick={() => loadFiles(selected, '')}>
                    <i className="fas fa-home" /> Root
                  </button>
                  <button className="primary" onClick={newFile}>
                    <i className="fas fa-file-medical" /> New
                  </button>
                  <label style={{ display: 'inline-block' }}>
                    <input type="file" multiple onChange={handleUpload}
                      style={{ display: 'none' }} />
                    <button className="success"
                      onClick={e => { e.preventDefault();
                        e.currentTarget.previousSibling.click(); }}>
                      <i className="fas fa-upload" /> Upload
                    </button>
                  </label>
                </div>

                {files.map(f => (
                  <div key={f.name}
                    className={`file-row ${!f.active ? 'disabled' : ''}`}>
                    <span className={`name ${f.isDir ? 'dir' : ''}`}
                      onClick={() => openFile(f)}>
                      <i className={f.isDir ? 'fas fa-folder' : 'fas fa-file-code'} />
                      {f.name}
                      {!f.isDir && (
                        <span style={{ fontSize: 11, color: '#8b949e' }}>
                          {(f.size / 1024).toFixed(1)} KB
                        </span>
                      )}
                    </span>
                    <button className="icon-btn" title="Toggle active"
                      onClick={() => toggleFile(f)}>
                      <i className={f.active ? 'fas fa-toggle-on' : 'fas fa-toggle-off'}
                        style={{ color: f.active ? '#1a7f37' : '#8b949e' }} />
                    </button>
                    {!f.isDir && (
                      <button className="icon-btn" title="Rename"
                        onClick={() => renameFile(f)}>
                        <i className="fas fa-i-cursor" />
                      </button>
                    )}
                    <button className="danger icon-btn" title="Delete"
                      onClick={() => deleteFile(f)}>
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="card">
                <h2><i className="fas fa-terminal" /> Bot Control</h2>
                <div className="toolbar">
                  <button className="success" onClick={() => action('start')}>
                    <i className="fas fa-play" /> Start
                  </button>
                  <button onClick={() => action('stop')}>
                    <i className="fas fa-stop" /> Stop
                  </button>
                  <button onClick={() => action('restart')}>
                    <i className="fas fa-redo" /> Restart
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* COLUMN 3: EDITOR + LOGS */}
          {selected && (
            <div>
              <div className="card">
                <h2>
                  <i className="fas fa-code" /> Editor
                  {editing && <span style={{ fontSize: 12, color: '#57606a', marginLeft: 6 }}>
                    — {editing}
                  </span>}
                </h2>
                {editing ? (
                  <>
                    <textarea value={content}
                      onChange={e => setContent(e.target.value)}
                      rows={16} />
                    <div className="toolbar" style={{ marginTop: 8 }}>
                      <button className="primary" onClick={saveFile}>
                        <i className="fas fa-save" /> Save
                      </button>
                      <button onClick={() => { setEditing(null); setContent(''); }}>
                        <i className="fas fa-times" /> Close
                      </button>
                    </div>
                  </>
                ) : (
                  <p style={{ color: '#57606a', fontSize: 13 }}>
                    <i className="fas fa-mouse-pointer" /> Click a file to edit.
                  </p>
                )}
              </div>

              <div className="card">
                <h2>
                  <i className="fas fa-list-alt" /> Live Logs
                  {live && <span className="live-dot" style={{ marginLeft: 8 }} />}
                </h2>
                <div className="toolbar">
                  <button onClick={() => startLogStream(selected)}>
                    <i className="fas fa-satellite-dish" /> Reconnect
                  </button>
                  <button onClick={() => setLogs('')}>
                    <i className="fas fa-broom" /> Clear
                  </button>
                </div>
                <pre className="logs" ref={logsRef}>
                  {logs || 'Waiting for logs...'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
        }
