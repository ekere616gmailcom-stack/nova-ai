import React, { useState } from 'react';
import {
  ArrowLeft,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { ContactItem } from '../types';

interface ContactsViewProps {
  contacts: ContactItem[];
  permissionGranted: boolean;
  onGrantPermission: () => void;
  onAddContact: (name: string, phone: string) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
  onAskCallInChat: (contact: ContactItem) => void;
  onBackToChat: () => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts,
  permissionGranted,
  onGrantPermission,
  onAddContact,
  onDeleteContact,
  onAskCallInChat,
  onBackToChat,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(!permissionGranted);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionGranted) {
      setShowPermissionPrompt(true);
      return;
    }
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    if (!cleanName || cleanPhone.length < 3) {
      setFormError('Enter both a contact name and valid phone number.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await onAddContact(cleanName, cleanPhone);
      setName('');
      setPhone('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save contact.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      c.phone.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6 sm:py-10 bg-[#0A0A0F]">
      <div className="max-w-[800px] mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 text-sm font-medium text-purple-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Chat</span>
          </button>

          {permissionGranted ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Contacts access allowed</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowPermissionPrompt(true)}
              className="px-3.5 py-2 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow cursor-pointer"
            >
              Allow Contacts Access
            </button>
          )}
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            Contacts
          </h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Save phone contacts so you can type “Call Mama” or “Call John” in Nova chat. Nova always lets you tap Call before dialing.
          </p>
        </div>

        {/* Add Contact Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl bg-[#1A1A22] border border-white/10 p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <UserPlus className="w-4 h-4 text-purple-400" />
            <span>Add New Contact</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Mama)"
              className="rounded-2xl bg-[#0A0A0F] border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (e.g. 08031234567)"
              className="rounded-2xl bg-[#0A0A0F] border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Contact'}</span>
            </button>
          </div>

          {formError && <p className="text-xs text-rose-400">{formError}</p>}
        </form>

        {/* Search & Contacts List */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full rounded-2xl bg-[#12121A] border border-white/10 ps-10 pe-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-[#12121A] border border-white/8 p-8 text-center text-sm text-slate-400">
              No contacts saved yet. Add someone above (for example, Mama · 0803...) and type “Call Mama” in chat.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((contact) => (
                <div
                  key={contact.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#1A1A22] border border-white/10 px-4 py-3.5"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/35 flex items-center justify-center text-sm font-semibold text-purple-200 shrink-0">
                      {contact.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {contact.name}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-slate-400">
                        {contact.phone}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAskCallInChat(contact)}
                      className="px-3 py-2 rounded-2xl text-xs font-medium bg-white/6 hover:bg-white/12 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Open Call Card
                    </button>

                    <a
                      href={`tel:${contact.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => void onDeleteContact(contact.id)}
                      aria-label={`Delete ${contact.name}`}
                      className="p-2 rounded-2xl text-slate-400 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contacts Permission Popup */}
      {showPermissionPrompt && !permissionGranted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#1A1A22] border border-purple-500/35 p-6 shadow-[0_0_60px_-15px_rgba(168,85,247,0.6)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-600/25 border border-purple-500/40 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-purple-300" />
              </div>
              <h2 className="text-base font-semibold text-white">
                Allow Nova to access contacts to make calls?
              </h2>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Nova only uses your saved contacts to show a Call Card when you ask to call someone. Nova will never place a call automatically without you tapping the green Call button.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowPermissionPrompt(false)}
                className="px-4 py-2 rounded-2xl text-xs font-medium bg-white/8 hover:bg-white/14 text-slate-200 cursor-pointer"
              >
                Not Now
              </button>
              <button
                type="button"
                onClick={() => {
                  onGrantPermission();
                  setShowPermissionPrompt(false);
                }}
                className="px-4 py-2 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow cursor-pointer"
              >
                Allow Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
