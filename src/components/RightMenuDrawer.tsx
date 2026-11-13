import React, { useEffect, useRef, useState } from 'react';
import {
  FolderOpen,
  Image as ImageIcon,
  MessageSquare,
  Phone,
  Search,
  SlidersHorizontal,
  User as UserIcon,
  Wallpaper,
  X,
} from 'lucide-react';
import { ActiveView, ChatSession, SavedImageEntry } from '../types';
import { NovaLogo } from './NovaLogo';

interface RightMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  onOpenCustomize: () => void;
  chats: ChatSession[];
  images: SavedImageEntry[];
  onOpenChat: (chatId: string) => void;
}

export const RightMenuDrawer: React.FC<RightMenuDrawerProps> = ({
  isOpen,
  onClose,
  activeView,
  onSelectView,
  onOpenCustomize,
  chats,
  images,
  onOpenChat,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSearchOpen(false);
    }
  }, [isOpen]);

  const trimmed = query.trim().toLowerCase();
  const matchingChats = trimmed
    ? chats
        .filter(
          (c) =>
            c.title.toLowerCase().includes(trimmed) ||
            c.lastMessagePreview.toLowerCase().includes(trimmed)
        )
        .slice(0, 5)
    : [];

  const matchingImages = trimmed
    ? images.filter((img) => img.prompt.toLowerCase().includes(trimmed)).slice(0, 4)
    : [];

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end transition-opacity duration-200 ${
        isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sliding Right Sidebar */}
      <aside
        className={`relative z-10 w-[300px] sm:w-[320px] h-full max-h-[100dvh] bg-[#0A0A0F] border-s border-white/10 shadow-[-16px_0_48px_-12px_rgba(124,58,237,0.35)] flex flex-col transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Top Header: Search Icon + Nova Title + Close */}
        <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search Nova"
              title="Search Nova"
              className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                searchOpen
                  ? 'bg-purple-600/25 border-purple-400 text-white'
                  : 'bg-[#12121A] border-white/10 text-slate-300 hover:text-white hover:border-purple-500/40'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <NovaLogo size={24} glow={false} />
              <span className="text-base font-semibold tracking-tight text-white truncate">
                Nova
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Expandable Search Input */}
        {searchOpen && (
          <div className="px-4 py-3 border-b border-white/8 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats, images & files..."
                className="w-full rounded-2xl bg-[#12121A] border border-purple-500/35 ps-8 pe-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>
        )}

        {/* Scrollable Menu Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3.5 space-y-5">
          {/* Quick Search Results */}
          {trimmed && (
            <div className="space-y-2.5 pb-3 border-b border-white/8">
              <div className="px-2 text-[11px] font-medium text-purple-300">
                Search Results
              </div>
              {matchingChats.length === 0 && matchingImages.length === 0 ? (
                <div className="px-2 py-2 text-xs text-slate-500">
                  No matching chats or images found.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {matchingChats.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => {
                        onOpenChat(chat.id);
                        onClose();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-[#12121A] hover:bg-[#1A1A22] text-start text-xs text-slate-200 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="truncate">{chat.title}</span>
                    </button>
                  ))}
                  {matchingImages.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => {
                        onSelectView('images');
                        onClose();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-[#12121A] hover:bg-[#1A1A22] text-start text-xs text-slate-200 transition-colors cursor-pointer"
                    >
                      <img
                        src={img.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-lg object-cover shrink-0"
                      />
                      <span className="truncate">{img.prompt}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Core ChatGPT-Style Menu List */}
          <nav className="space-y-1.5" aria-label="Nova right menu">
            <button
              type="button"
              onClick={() => {
                onSelectView('images');
                onClose();
              }}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
                activeView === 'images'
                  ? 'bg-[#1A1A22] border-purple-500/45 text-white shadow-[0_0_24px_-10px_rgba(168,85,247,0.7)]'
                  : 'bg-[#12121A]/70 border-white/6 text-slate-200 hover:bg-[#1A1A22] hover:border-purple-500/35 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-purple-300" />
                </div>
                <div className="text-start min-w-0">
                  <div className="text-sm font-medium text-white">Images</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Gallery of all AI images
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                {images.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectView('space');
                onClose();
              }}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
                activeView === 'space'
                  ? 'bg-[#1A1A22] border-purple-500/45 text-white shadow-[0_0_24px_-10px_rgba(168,85,247,0.7)]'
                  : 'bg-[#12121A]/70 border-white/6 text-slate-200 hover:bg-[#1A1A22] hover:border-purple-500/35 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-purple-300" />
                </div>
                <div className="text-start min-w-0">
                  <div className="text-sm font-medium text-white">Space</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Saved chats &amp; uploaded files
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                {chats.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCustomize();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium bg-[#12121A]/70 border border-white/6 text-slate-200 hover:bg-[#1A1A22] hover:border-purple-500/35 hover:text-white transition-all cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-purple-300" />
              </div>
              <div className="text-start min-w-0">
                <div className="text-sm font-medium text-white">Customize</div>
                <div className="text-[11px] text-slate-400 truncate">
                  Language, Nova voice &amp; plan
                </div>
              </div>
            </button>
          </nav>

          {/* Smart Features & Account Quick Links */}
          <div className="pt-3 border-t border-white/8 space-y-1.5">
            <div className="px-2 pb-1 text-[11px] font-medium text-slate-500">
              Tools &amp; Account
            </div>

            <button
              type="button"
              onClick={() => {
                onSelectView('contacts');
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-colors cursor-pointer ${
                activeView === 'contacts'
                  ? 'bg-[#1A1A22] text-white border border-purple-500/40'
                  : 'text-slate-300 hover:bg-[#14141C] hover:text-white border border-transparent'
              }`}
            >
              <Phone className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Contacts &amp; Calls</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectView('wallpaper');
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-colors cursor-pointer ${
                activeView === 'wallpaper'
                  ? 'bg-[#1A1A22] text-white border border-purple-500/40'
                  : 'text-slate-300 hover:bg-[#14141C] hover:text-white border border-transparent'
              }`}
            >
              <Wallpaper className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Daily Wallpaper</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectView('profile');
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-colors cursor-pointer ${
                activeView === 'profile'
                  ? 'bg-[#1A1A22] text-white border border-purple-500/40'
                  : 'text-slate-300 hover:bg-[#14141C] hover:text-white border border-transparent'
              }`}
            >
              <UserIcon className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Profile &amp; Account</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
