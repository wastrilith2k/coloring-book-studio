import { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeft,
  DollarSign,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api.js';

function CostBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="admin-bar">
      <div className="admin-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function UserReport({ user, allModels, userDaily }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () => userDaily.filter(r => r.user_id === user.user_id),
    [userDaily, user.user_id]
  );

  // Group by day
  const byDay = useMemo(() => {
    const map = {};
    for (const r of rows) {
      if (!map[r.day]) map[r.day] = { day: r.day, count: 0, cents: 0, models: {} };
      map[r.day].count += Number(r.count);
      map[r.day].cents += Number(r.total_cents);
      map[r.day].models[r.model_id] = (map[r.day].models[r.model_id] || 0) + Number(r.count);
    }
    return Object.values(map).sort((a, b) => b.day.localeCompare(a.day));
  }, [rows]);

  const label = user.email || user.user_id.slice(0, 12) + '...';

  return (
    <div className="admin-user-report">
      <button className="admin-user-row" onClick={() => setOpen(!open)}>
        <div className="admin-user-info">
          <strong>{label}</strong>
          <span className="admin-user-meta">
            {user.count} images &middot; ${(user.total_cents / 100).toFixed(2)}
            &middot; {user.first_gen?.slice(0, 10)} to {user.last_gen?.slice(0, 10)}
          </span>
        </div>
        <span className="admin-user-cost">${(user.total_cents / 100).toFixed(2)}</span>
      </button>
      {open && byDay.length > 0 && (
        <div className="admin-user-detail">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Images</th>
                <th>Cost</th>
                <th>Models</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map(d => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.count}</td>
                  <td>${(d.cents / 100).toFixed(3)}</td>
                  <td className="admin-model-tags">
                    {Object.entries(d.models).map(([m, c]) => (
                      <span key={m} className="admin-model-tag">
                        {allModels.find(am => am.id === m)?.label || m} ({c})
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminPanel({ onClose }) {
  const [allModels, setAllModels] = useState([]);
  const [enabledIds, setEnabledIds] = useState([]);
  const [defaultCoverModel, setDefaultCoverModel] = useState('');
  const [defaultPageModel, setDefaultPageModel] = useState('');
  const [evaluatorEnabled, setEvaluatorEnabled] = useState(true);
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, statsRes] = await Promise.all([
          apiFetch('/api/settings'),
          apiFetch('/api/admin/stats'),
        ]);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setAllModels(data.allModels || []);
          setEnabledIds((data.enabledModels || []).map(m => m.id));
          setDefaultCoverModel(data.defaultCoverModel || '');
          setDefaultPageModel(data.defaultPageModel || '');
          setEvaluatorEnabled(data.promptEvaluatorEnabled !== false);
        }
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data.stats);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const toggleModel = async (modelId) => {
    const next = enabledIds.includes(modelId)
      ? enabledIds.filter(id => id !== modelId)
      : [...enabledIds, modelId];
    if (!next.length) return;
    setEnabledIds(next);
    setSaving(true);
    try {
      await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({ enabledModels: next }),
      });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const saveDefaultModel = async (key, value) => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleCoverModelChange = e => {
    setDefaultCoverModel(e.target.value);
    saveDefaultModel('defaultCoverModel', e.target.value);
  };

  const handlePageModelChange = e => {
    setDefaultPageModel(e.target.value);
    saveDefaultModel('defaultPageModel', e.target.value);
  };

  const enabledModelsForSelect = allModels.filter(m => enabledIds.includes(m.id));

  const totalCents = Number(stats?.overall?.total_cents) || 0;
  const totalCount = Number(stats?.overall?.count) || 0;
  const daily = stats?.daily || [];
  const maxDailyCents = Math.max(...daily.map(d => Number(d.total_cents)), 1);

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-page__header">
          <button className="btn ghost" onClick={onClose}><ArrowLeft size={16} /> Back</button>
          <h2>Admin</h2>
          <button className="btn ghost admin-page__close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="admin-page__loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <button className="btn ghost" onClick={onClose}><ArrowLeft size={16} /> Back</button>
        <h2>Admin Dashboard</h2>
        <button className="btn ghost admin-page__close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="admin-page__body">
        {/* Summary cards */}
        <div className="admin-cards">
          <div className="admin-card-stat">
            <DollarSign size={20} />
            <div>
              <span className="admin-card-stat__value">${(totalCents / 100).toFixed(2)}</span>
              <span className="admin-card-stat__label">Total spent</span>
            </div>
          </div>
          <div className="admin-card-stat">
            <Zap size={20} />
            <div>
              <span className="admin-card-stat__value">{totalCount}</span>
              <span className="admin-card-stat__label">Images generated</span>
            </div>
          </div>
          <div className="admin-card-stat">
            <Users size={20} />
            <div>
              <span className="admin-card-stat__value">{stats?.byUser?.length || 0}</span>
              <span className="admin-card-stat__label">Users</span>
            </div>
          </div>
          <div className="admin-card-stat">
            <DollarSign size={20} />
            <div>
              <span className="admin-card-stat__value">
                ${totalCount > 0 ? (totalCents / totalCount / 100).toFixed(3) : '0.000'}
              </span>
              <span className="admin-card-stat__label">Avg cost / image</span>
            </div>
          </div>
        </div>

        {/* Daily chart */}
        <div className="admin-section-card">
          <h3><TrendingUp size={16} /> Daily Usage (30 days)</h3>
          {daily.length === 0 ? (
            <p className="admin-empty">No data yet</p>
          ) : (
            <div className="admin-daily-chart">
              {daily.map(d => (
                <div key={d.day} className="admin-daily-row">
                  <span className="admin-daily-date">{d.day.slice(5)}</span>
                  <CostBar value={Number(d.total_cents)} max={maxDailyCents} />
                  <span className="admin-daily-val">{d.count} &middot; ${(Number(d.total_cents) / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By model */}
        {stats?.byModel?.length > 0 && (
          <div className="admin-section-card">
            <h3>By Model</h3>
            <table className="admin-table">
              <thead>
                <tr><th>Model</th><th>Images</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {stats.byModel.map(row => (
                  <tr key={row.model_id}>
                    <td>{allModels.find(m => m.id === row.model_id)?.label || row.model_id}</td>
                    <td>{row.count}</td>
                    <td>${(Number(row.total_cents) / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Per-user reports */}
        <div className="admin-section-card">
          <h3><Users size={16} /> Per-User Usage</h3>
          {!stats?.byUser?.length ? (
            <p className="admin-empty">No data yet</p>
          ) : (
            <div className="admin-user-list">
              {stats.byUser.map(u => (
                <UserReport
                  key={u.user_id}
                  user={u}
                  allModels={allModels}
                  userDaily={stats.userDaily || []}
                />
              ))}
            </div>
          )}
        </div>

        {/* Model toggles */}
        <div className="admin-section-card">
          <h3>Enabled Models {saving && <span className="admin-saving">Saving...</span>}</h3>
          <div className="admin-model-list">
            {allModels.map(m => {
              const on = enabledIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  className={`admin-model-toggle ${on ? 'is-on' : ''}`}
                  onClick={() => toggleModel(m.id)}
                  disabled={on && enabledIds.length === 1}
                >
                  {on ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  <div>
                    <strong>{m.label}</strong>
                    <span>{m.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Default models */}
        <div className="admin-section-card">
          <h3>Default Models</h3>
          <div className="admin-default-models">
            <div className="admin-default-model">
              <label htmlFor="default-cover-model">Cover</label>
              <select id="default-cover-model" value={defaultCoverModel} onChange={handleCoverModelChange}>
                <option value="">Same as pages</option>
                {enabledModelsForSelect.map(m => (
                  <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
                ))}
              </select>
            </div>
            <div className="admin-default-model">
              <label htmlFor="default-page-model">Pages</label>
              <select id="default-page-model" value={defaultPageModel} onChange={handlePageModelChange}>
                <option value="">First enabled model</option>
                {enabledModelsForSelect.map(m => (
                  <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Prompt evaluator toggle */}
        <div className="admin-section-card">
          <h3>Prompt Optimizer</h3>
          <p className="admin-hint">Uses a cheap LLM (~$0.0001/prompt) to improve image generation prompts before sending them to the image model.</p>
          <button
            className={`admin-model-toggle ${evaluatorEnabled ? 'is-on' : ''}`}
            onClick={() => {
              const next = !evaluatorEnabled;
              setEvaluatorEnabled(next);
              saveDefaultModel('promptEvaluatorEnabled', next);
            }}
          >
            {evaluatorEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            <div>
              <strong>{evaluatorEnabled ? 'Enabled' : 'Disabled'}</strong>
              <span>Optimizes prompts before image generation</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
