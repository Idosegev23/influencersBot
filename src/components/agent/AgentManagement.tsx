'use client';

import { useEffect, useState } from 'react';
import { Loader2, UserPlus, KeyRound, ShieldCheck, Shield, UserX, UserCheck, Inbox } from 'lucide-react';

type ManagedAgent = {
  id: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  is_active: boolean;
  is_routable: boolean;
  last_login_at: string | null;
  open_tickets: number;
};

const ERRORS: Record<string, string> = {
  name_required: 'צריך שם פרטי ושם משפחה',
  password_too_short: 'סיסמה של 6 תווים לפחות',
  name_taken: 'כבר יש נציג/ה בשם הזה. הכניסה למערכת היא לפי שם, אז השם חייב להיות ייחודי',
  cannot_demote_self: 'אי אפשר להסיר את ההרשאות של עצמך',
  forbidden: 'אין הרשאת אדמין',
  unauthorized: 'החיבור פג, יש להתחבר מחדש',
};

const card = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' };
const input = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
};

function formatLogin(iso: string | null): string {
  if (!iso) return 'לא התחבר/ה';
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AgentManagement({ accountUsername }: { accountUsername: string }) {
  const [agents, setAgents] = useState<ManagedAgent[] | null>(null);
  const [selfId, setSelfId] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ first_name: '', last_name: '', password: '', is_admin: false });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/agent/manage?accountUsername=${encodeURIComponent(accountUsername)}`, {
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: 'err', text: ERRORS[body.error] || 'טעינה נכשלה' });
      setAgents([]);
      return;
    }
    setAgents(body.agents);
    setSelfId(body.self_id);
  };

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUsername]);

  const call = async (method: 'POST' | 'PATCH', payload: Record<string, unknown>) => {
    const res = await fetch('/api/agent/manage', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountUsername, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(ERRORS[body.error] || 'הפעולה נכשלה');
    return body;
  };

  const update = async (agent: ManagedAgent, patch: Record<string, unknown>, okText: string) => {
    setBusyId(agent.id);
    setMessage(null);
    try {
      await call('PATCH', { id: agent.id, ...patch });
      setMessage({ kind: 'ok', text: okText });
      await load();
      return true;
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const addAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setMessage(null);
    try {
      await call('POST', { ...form });
      setMessage({
        kind: 'ok',
        text: `${form.first_name} ${form.last_name} נוסף/ה. הכניסה: שם פרטי, שם משפחה והסיסמה שהגדרת`,
      });
      setForm({ first_name: '', last_name: '', password: '', is_admin: false });
      await load();
    } catch (err) {
      setMessage({ kind: 'err', text: (err as Error).message });
    } finally {
      setAdding(false);
    }
  };

  if (!agents) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#883fe2' }} />
      </div>
    );
  }

  const active = agents.filter((a) => a.is_active);
  const inactive = agents.filter((a) => !a.is_active);

  return (
    <div className="space-y-5">
      {message && (
        <div
          className="p-3 rounded-xl text-sm"
          style={{
            background: message.kind === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color: message.kind === 'ok' ? '#86efac' : '#fca5a5',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Add agent */}
      <form onSubmit={addAgent} className="p-4 rounded-2xl space-y-3" style={card}>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="w-4 h-4" style={{ color: '#883fe2' }} />
          הוספת נציג/ה
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            placeholder="שם פרטי"
            className="p-2 rounded-lg text-sm outline-none"
            style={input}
          />
          <input
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            placeholder="שם משפחה"
            className="p-2 rounded-lg text-sm outline-none"
            style={input}
          />
          <input
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="סיסמה (6 תווים לפחות)"
            type="text"
            autoComplete="off"
            className="p-2 rounded-lg text-sm outline-none"
            style={input}
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm" style={{ color: '#d1d5db' }}>
            <input
              type="checkbox"
              checked={form.is_admin}
              onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
            />
            אדמין (רואה את כל הפניות ואת ממשק האדמין, ולא מקבל פניות חדשות אוטומטית)
          </label>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-60"
            style={{ background: '#883fe2', color: '#fff' }}
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            הוספה
          </button>
        </div>
      </form>

      {/* Active agents */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: '#9ca3af' }}>
          נציגים פעילים ({active.length})
        </h2>
        <div className="space-y-2">
          {active.map((a) => {
            const isSelf = a.id === selfId;
            const busy = busyId === a.id;
            const name = `${a.first_name} ${a.last_name}`;
            return (
              <div key={a.id} className="p-3 rounded-xl space-y-2" style={card}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{name}</span>
                    {isSelf && <span className="text-xs" style={{ color: '#9ca3af' }}>(את/ה)</span>}
                    {a.is_admin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#883fe2' }}>
                        אדמין
                      </span>
                    )}
                    {!a.is_admin && !a.is_routable && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)', color: '#d1d5db' }}>
                        לא מקבל/ת פניות חדשות
                      </span>
                    )}
                  </div>
                  <div className="text-xs flex gap-3" style={{ color: '#9ca3af' }}>
                    <span>{a.open_tickets} פניות פתוחות</span>
                    <span>כניסה אחרונה: {formatLogin(a.last_login_at)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    disabled={busy || isSelf}
                    title={isSelf ? 'אי אפשר לשנות את ההרשאה של עצמך' : undefined}
                    onClick={() =>
                      update(a, { is_admin: !a.is_admin }, a.is_admin ? `${name} כבר לא אדמין` : `${name} עכשיו אדמין`)
                    }
                    icon={a.is_admin ? <Shield className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    label={a.is_admin ? 'הסרת אדמין' : 'הפיכה לאדמין'}
                  />
                  {!a.is_admin && (
                    <ActionButton
                      disabled={busy}
                      onClick={() =>
                        update(
                          a,
                          { is_routable: !a.is_routable },
                          a.is_routable ? `${name} לא יקבל/תקבל פניות חדשות` : `${name} חוזר/ת לחלוקת פניות`,
                        )
                      }
                      icon={<Inbox className="w-3.5 h-3.5" />}
                      label={a.is_routable ? 'הפסקת חלוקת פניות' : 'החזרה לחלוקת פניות'}
                    />
                  )}
                  <ActionButton
                    disabled={busy}
                    onClick={() => {
                      setPasswordFor(passwordFor === a.id ? null : a.id);
                      setNewPassword('');
                    }}
                    icon={<KeyRound className="w-3.5 h-3.5" />}
                    label="איפוס סיסמה"
                  />
                  <ActionButton
                    disabled={busy || isSelf}
                    danger
                    title={isSelf ? 'אי אפשר להשבית את עצמך' : undefined}
                    onClick={() => {
                      const extra =
                        a.open_tickets > 0
                          ? `\n${a.open_tickets} הפניות שלו/ה יישארו משויכות אליו/ה. אפשר להעביר אותן ידנית מתוך הפנייה.`
                          : '';
                      if (window.confirm(`להשבית את ${name}? הכניסה שלו/ה תיחסם מיד.${extra}`)) {
                        update(a, { is_active: false }, `${name} הושבת/ה`);
                      }
                    }}
                    icon={<UserX className="w-3.5 h-3.5" />}
                    label="השבתה"
                  />
                  {busy && <Loader2 className="w-4 h-4 animate-spin self-center" style={{ color: '#883fe2' }} />}
                </div>

                {passwordFor === a.id && (
                  <div className="flex gap-2 flex-wrap">
                    <input
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="סיסמה חדשה (6 תווים לפחות)"
                      type="text"
                      autoComplete="off"
                      className="p-2 rounded-lg text-sm outline-none flex-1 min-w-[180px]"
                      style={input}
                    />
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (await update(a, { password: newPassword }, `הסיסמה של ${name} עודכנה`)) {
                          setPasswordFor(null);
                        }
                      }}
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{ background: '#883fe2', color: '#fff' }}
                    >
                      שמירה
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Deactivated agents */}
      {inactive.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: '#9ca3af' }}>
            נציגים מושבתים ({inactive.length})
          </h2>
          {inactive.map((a) => (
            <div key={a.id} className="p-3 rounded-xl flex items-center justify-between flex-wrap gap-2" style={{ ...card, opacity: 0.7 }}>
              <span>{`${a.first_name} ${a.last_name}`}</span>
              <ActionButton
                disabled={busyId === a.id}
                onClick={() => update(a, { is_active: true }, `${a.first_name} ${a.last_name} הופעל/ה מחדש`)}
                icon={<UserCheck className="w-3.5 h-3.5" />}
                label="הפעלה מחדש"
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  disabled,
  danger,
  title,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
        color: danger ? '#fca5a5' : '#d1d5db',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
