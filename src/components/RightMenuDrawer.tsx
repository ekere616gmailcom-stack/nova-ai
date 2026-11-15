import React, { useEffect, useRef, useState } from 'react';
import {
  History,
  Image as ImageIcon,
  MessageSquare,
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
  onOpenSettings: () => void;
  chats: ChatSession[];
  images: SavedImageEntry[];
  onOpenChat: (chatId: string) => void;
}

export const RightMenuDrawer: React.FC<RightMenuDrawerProps> = ({
  isOpen,
  onClose,
  activeView,
  onSelectView,
  onOpenSettings,
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
        className={`relative z-10 w-[300px] sm:w-[320px] h-full max-h-[100dvh] bg-[#0A0A0A] border-s border-[#A855F7]/35 shadow-[-16px_0_48px_-12px_rgba(191,90,242,0.35)] flex flex-col transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-[#A855F7]/25 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search Nova"
              title="Search Nova"
              className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                searchOpen
                  ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white'
                  : 'bg-black border-[#A855F7]/30 text-white/75 hover:text-white hover:border-[#BF5AF2]'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <NovaLogo size={24} glow={true} />
              <span className="text-base font-semibold tracking-tight text-white truncate">
                Nova
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 rounded-xl text-white/65 hover:text-white hover:bg-[#A855F7]/15 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Expandable Search Input */}
        {searchOpen && (
          <div className="px-4 py-3 border-b border-[#A855F7]/25 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#A855F7] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats & images..."
                className="w-full rounded-2xl bg-black border border-[#A855F7]/40 ps-8 pe-3 py-2 text-xs text-white placeholder:text-white/45 focus:outline-none focus:border-[#BF5AF2]"
              />
            </div>
          </div>
        )}

        {/* Scrollable Menu Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3.5 space-y-5">
          {/* Quick Search Results */}
          {trimmed && (
            <div className="space-y-2.5 pb-3 border-b border-[#A855F7]/20">
              <div className="px-2 text-[11px] font-medium text-[#BF5AF2]">
                Search Results
              </div>
              {matchingChats.length === 0 && matchingImages.length === 0 ? (
                <div className="px-2 py-2 text-xs text-white/50">
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
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-black border border-[#A855F7]/25 hover:border-[#BF5AF2] text-start text-xs text-white transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#BF5AF2] shrink-0" />
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
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-black border border-[#A855F7]/25 hover:border-[#BF5AF2] text-start text-xs text-white transition-colors cursor-pointer"
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

          {/* Core Menu List: Chat, Real photo / AI art, Ekere wallpaper, Settings */}
          <nav className="space-y-2" aria-label="Nova menu">
            <button
              type="button"
              onClick={() => {
                onSelectView('chat');
                onClose();
              }}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
                activeView === 'chat'
                  ? 'bg-black border-[#BF5AF2] text-white nova-active-glow'
                  : 'bg-black border-[#A855F7]/25 text-white hover:border-[#BF5AF2]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-[#BF5AF2]" />
                </div>
                <div className="text-start min-w-0">
                  <div className="text-sm font-medium text-white">Chat &amp; Build</div>
                  <div className="text-[11px] text-white/60 truncate">
                    Ask Nova or build websites &amp; apps
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono tabular-nums text-white/65 shrink-0">
                {chats.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectView('images');
                onClose();
              }}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
                activeView === 'images'
                  ? 'bg-black border-[#BF5AF2] text-white nova-active-glow'
                  : 'bg-black border-[#A855F7]/25 text-white hover:border-[#BF5AF2]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-[#BF5AF2]" />
                </div>
                <div className="text-start min-w-0">
                  <div className="text-sm font-medium text-white">Real Photo &amp; AI Art</div>
                  <div className="text-[11px] text-white/60 truncate">
                    Generate photos, art &amp; gallery
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono tabular-nums text-white/65 shrink-0">
                {images.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectView('history');
                onClose();
              }}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
                activeView === 'history'
                  ? 'bg-black border-[#BF5AF2] text-white nova-active-glow'
                  : 'bg-black border-[#A855F7]/25 text-white hover:border-[#BF5AF2]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center shrink-0">
                  <History className="w-4 h-4 text-[#BF5AF2]" />
                </div>
                <div className="text-start min-w-0">
                  <div className="text-sm font-medium text-white">Full History</div>
                  <div className="text-[11px] text-white/60 truncate">
                    Big scrollable view of all chats
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono tabular-nums text-white/65 shrink-0">
                {chats.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectView('wallpaper');
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
                activeView === 'wallpaper'
                  ? 'bg-black border-[#BF5AF2] text-white nova-active-glow'
                  : 'bg-black border-[#A855F7]/25 text-white hover:border-[#BF5AF2]'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center shrink-0">
                <Wallpaper className="w-4 h-4 text-[#BF5AF2]" />
              </div>
              <div className="text-start min-w-0">
                <div className="text-sm font-medium text-white">Ekere Wallpaper</div>
                <div className="text-[11px] text-white/60 truncate">
                  9:16 mobile AI wallpapers
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium bg-black border border-[#A855F7]/25 text-white hover:border-[#BF5AF2] transition-all cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-[#BF5AF2]" />
              </div>
              <div className="text-start min-w-0">
                <div className="text-sm font-medium text-white">Settings</div>
                <div className="text-[11px] text-white/60 truncate">
                  Memory, language &amp; voice
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectView('profile');
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
                activeView === 'profile'
                  ? 'bg-black border-[#BF5AF2] text-white nova-active-glow'
                  : 'bg-black border-[#A855F7]/25 text-white hover:border-[#BF5AF2]'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-[#BF5AF2]" />
              </div>
              <div className="text-start min-w-0">
                <div className="text-sm font-medium text-white">Account</div>
                <div className="text-[11px] text-white/60 truncate">
                  Google sign-in &amp; chat history
                </div>
              </div>
            </button>
          </nav>

          {chats.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#A855F7]/20">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-[#BF5AF2]">Recent History</span>
                <button
                  type="button"
                  onClick={() => {
                    onSelectView('history');
                    onClose();
                  }}
                  className="text-xs text-white/75 hover:text-white underline underline-offset-2 cursor-pointer"
                >
                  Open Big View
                </button>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto overscroll-y-contain pe-1">
                {chats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => {
                      onOpenChat(chat.id);
                      onClose();
                    }}
                    className="w-full flex flex-col gap-0.5 px-3 py-2.5 rounded-2xl bg-black border border-[#A855F7]/25 hover:border-[#BF5AF2] text-start transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-white truncate">
                      {chat.title}
                    </span>
                    {chat.lastMessagePreview && (
                      <span className="text-[11px] text-white/55 truncate">
                        {chat.lastMessagePreview}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
