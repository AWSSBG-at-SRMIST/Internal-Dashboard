'use client';

import { useState, useEffect } from 'react';
import { Calendar, Save, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionUser } from '@/types';
import { isPresidium } from '@/lib/permissions';
import { Card, CardContent } from '@/components/ui/card';

const DAY_ORDERS = ['DO1', 'DO2', 'DO3', 'DO4', 'DO5'] as const;
type DayOrder = typeof DAY_ORDERS[number];

const TIME_SLOTS = [
  '*',
  '8:00-8:50',
  '8:50-9:40',
  '9:45-10:35',
  '10:40-11:30',
  '11:35-12:25',
  '12:30-1:20',
  '1:25-2:15',
  '2:20-3:10',
  '3:10-4:00',
  '4:00-4:50',
] as const;
type TimeSlot = typeof TIME_SLOTS[number];

function slotKey(do_: DayOrder, slot: TimeSlot) {
  return `${do_}-${slot}`;
}

interface FreeSlotRecord {
  memberId: string;
  memberName: string;
  slots: string[];
}

interface Props {
  user: SessionUser;
  initialMySlots: string[];
}

export default function FreeSlotsClient({ user, initialMySlots }: Props) {
  const presidium = isPresidium(user);
  const canEnter = !presidium;
  const canView = user.role !== 'BUILDER';

  const [activeTab, setActiveTab] = useState<'schedule' | 'view'>(presidium ? 'view' : 'schedule');
  const [selected, setSelected] = useState<Set<string>>(new Set(initialMySlots));
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(initialMySlots.length > 0);

  const [selectedDO, setSelectedDO] = useState<DayOrder>('DO1');
  const [records, setRecords] = useState<FreeSlotRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);

  useEffect(() => {
    if (activeTab === 'view' && !recordsLoaded) loadRecords();
  }, [activeTab]);

  async function loadRecords() {
    setLoadingRecords(true);
    try {
      const res = await fetch('/api/free-slots');
      const data = await res.json();
      if (data.success) {
        setRecords(data.data);
        setRecordsLoaded(true);
      } else {
        toast.error(data.error || 'Failed to load schedules');
      }
    } catch {
      toast.error('Failed to load schedules');
    } finally {
      setLoadingRecords(false);
    }
  }

  function toggleSlot(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      const res = await fetch('/api/free-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Schedule saved');
        setSavedOnce(true);
        // Invalidate view cache so it reflects the update next time
        setRecordsLoaded(false);
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }

  function getMembersAtSlot(do_: DayOrder, slot: TimeSlot): string[] {
    const key = slotKey(do_, slot);
    return records.filter(r => r.slots.includes(key)).map(r => r.memberName);
  }

  const showTabs = canEnter && canView;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-[#FF9900]/10 border-2 border-[#FF9900]/30 flex items-center justify-center flex-shrink-0">
          <Calendar size={22} className="text-[#FF9900]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Free Slots</h1>
          <p className="text-sm text-[#666] mt-1 font-mono">Member availability by day order</p>
        </div>
      </div>

      {/* Tabs */}
      {showTabs && (
        <div className="flex border-b-2 border-[#2d2d2d]">
          {(['schedule', 'view'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-widest font-mono border-b-2 -mb-[2px] transition-colors ${
                activeTab === tab
                  ? 'border-[#FF9900] text-[#FF9900]'
                  : 'border-transparent text-[#555] hover:text-[#aaa]'
              }`}
            >
              {tab === 'schedule' ? 'My Schedule' : 'View'}
            </button>
          ))}
        </div>
      )}

      {/* ── My Schedule ── */}
      {activeTab === 'schedule' && canEnter && (
        <div className="space-y-5">
          {savedOnce && (
            <p className="text-xs text-[#666] font-mono">Your previously saved schedule is pre-filled. Update and save again to change it.</p>
          )}
          {DAY_ORDERS.map(do_ => (
            <Card key={do_}>
              <CardContent className="p-4">
                <h2 className="text-xs font-bold text-[#FF9900] uppercase tracking-widest mb-3 font-mono">
                  Day Order {do_.replace('DO', '')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {TIME_SLOTS.map(slot => {
                    const key = slotKey(do_, slot);
                    const checked = selected.has(key);
                    return (
                      <button
                        key={slot}
                        onClick={() => toggleSlot(key)}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-mono border-2 transition-all text-left ${
                          checked
                            ? 'border-[#FF9900] bg-[#FF9900]/10 text-[#FF9900]'
                            : 'border-[#2d2d2d] text-[#666] hover:border-[#444] hover:text-[#aaa]'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center ${
                          checked ? 'border-[#FF9900] bg-[#FF9900]' : 'border-[#444]'
                        }`}>
                          {checked && <Check size={9} className="text-black" strokeWidth={3} />}
                        </div>
                        {slot === '*' ? '* Full Day' : slot}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          <button
            onClick={saveSchedule}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-[#FF9900] text-black text-xs font-bold uppercase tracking-widest font-mono hover:bg-[#e68900] disabled:opacity-50 transition-colors"
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      )}

      {/* ── View ── */}
      {activeTab === 'view' && canView && (
        <div className="space-y-5">
          {/* DO selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {DAY_ORDERS.map(do_ => (
              <button
                key={do_}
                onClick={() => setSelectedDO(do_)}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest font-mono border-2 transition-all ${
                  selectedDO === do_
                    ? 'border-[#FF9900] bg-[#FF9900]/10 text-[#FF9900]'
                    : 'border-[#2d2d2d] text-[#555] hover:border-[#444] hover:text-[#aaa]'
                }`}
              >
                {do_}
              </button>
            ))}
            <button
              onClick={() => { setRecordsLoaded(false); loadRecords(); }}
              disabled={loadingRecords}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-[#555] border-2 border-[#2d2d2d] hover:border-[#444] hover:text-[#aaa] disabled:opacity-40 transition-all"
            >
              <RefreshCw size={12} className={loadingRecords ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {loadingRecords ? (
            <div className="text-center py-12 text-[#555] font-mono text-sm">Loading schedules...</div>
          ) : (
            <div className="space-y-1.5">
              {TIME_SLOTS.map(slot => {
                const members = getMembersAtSlot(selectedDO, slot);
                return (
                  <Card key={slot}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-4 min-h-[28px]">
                        <div className="w-32 flex-shrink-0 pt-0.5">
                          <span className={`text-xs font-bold font-mono uppercase ${slot === '*' ? 'text-[#FF9900]' : 'text-[#aaa]'}`}>
                            {slot === '*' ? '* Full Day' : slot}
                          </span>
                        </div>
                        {members.length === 0 ? (
                          <span className="text-xs text-[#333] font-mono italic pt-0.5">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {members.map(name => (
                              <span
                                key={name}
                                className="px-2 py-0.5 text-xs font-mono bg-[#1a1a1a] border border-[#2d2d2d] text-[#ccc]"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
