import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Download,
  ExternalLink,
  History,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ChatSession, SavedImageEntry } from '../types';

interface HistoryViewProps {
  chats: ChatSession[];
  images: SavedImageEntry[];
  activeChatId: string | null;
  onOpenChat: (chatId: string) => void;
  onDeleteChat: (chatId: string, e: React.MouseEvent) => void;
  onNewChat: () => void;
  onBackToChat: () => void;
  onOpenImageStudio: () => void;
}

function formatHistoryDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return '';
  try {
    const date = new Date(ms);
    const now = new Date();
    const isSameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (isSameDay) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  chats,
  images,
  activeChatId,
  onOpenChat,
  onDeleteChat,
  onNewChat,
  onBackToChat,
  onOpenImageStudio,
}) => {
  const [tab, setTab] = useState<'chats' | 'images'>('chats');
  const [search, setSearch] = useState('');

  const cleanSearch = search.trim().toLowerCase();

  const filteredChats = useMemo(() => {
    if (!cleanSearch) return chats;
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(cleanSearch) ||
        c.lastMessagePreview.toLowerCase().includes(cleanSearch)
    );
  }, [chats, cleanSearch]);

  const filteredImages = useMemo(() => {
    if (!cleanSearch) return images;
    return images.filter((img) => img.prompt.toLowerCase().includes(cleanSearch));
  }, [images, cleanSearch]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-black/55 backdrop-blur-sm">
      {/* Top Controls */}
      <div className="shrink-0 border-b border-[#A855F7]/30 bg-black/80 px-4 sm:px-8 py-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={onBackToChat}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#BF5AF2] hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Chat</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onNewChat}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Chat</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#A855F7]/20 border border-[#BF5AF2]/50 flex items-center justify-center shrink-0">
                <History className="w-5 h-5 text-[#BF5AF2]" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                  Your Nova History
                </h1>
                <p className="text-xs text-white/65">
                  {chats.length} {chats.length === 1 ? 'chat' : 'chats'} · {images.length}{' '}
                  {images.length === 1 ? 'image' : 'images'} saved
                </p>
              </div>
            </div>

            {/* Chats / Images Tab Toggle */}
            <div className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/35 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTab('chats')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  tab === 'chats'
                    ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chats ({chats.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('images')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  tab === 'images'
                    ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Images ({images.length})</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#BF5AF2] absolute start-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === 'chats'
                  ? 'Search all your past chats...'
                  : 'Search generated images...'
              }
              className="w-full rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/40 ps-11 pe-4 py-3 text-sm text-white placeholder:text-white/45 focus:outline-none focus:border-[#BF5AF2]"
            />
          </div>
        </div>
      </div>

      {/* Big Scrollable History Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6">
        <div className="max-w-5xl mx-auto pb-12">
          {tab === 'chats' ? (
            filteredChats.length === 0 ? (
              <div className="rounded-3xl bg-[#0A0A0A]/90 border border-[#A855F7]/30 p-10 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-[#BF5AF2]" />
                </div>
                <div className="text-base font-semibold text-white">
                  {cleanSearch ? 'No matching chats found' : 'No chat history yet'}
                </div>
                <p className="text-sm text-white/65 max-w-md mx-auto">
                  {cleanSearch
                    ? 'Try a different keyword or clear the search box.'
                    : 'Start a conversation with Nova and every chat will appear here in big, easy-to-scroll cards.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredChats.map((chat) => {
                  const isCurrent = chat.id === activeChatId;
                  return (
                    <div
                      key={chat.id}
                      onClick={() => onOpenChat(chat.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          onOpenChat(chat.id);
                        }
                      }}
                      className={`group rounded-2xl p-4 sm:p-5 transition-all cursor-pointer border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-[#0A0A0A] border-[#BF5AF2] nova-active-glow'
                          : 'bg-[#0A0A0A]/90 border-[#A855F7]/30 hover:border-[#BF5AF2] hover:bg-[#0A0A0A]'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-2xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center shrink-0 mt-0.5">
                          <MessageSquare className="w-5 h-5 text-[#BF5AF2]" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-semibold text-white break-words">
                              {chat.title || 'New Chat'}
                            </h2>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-[#BF5AF2]/20 border border-[#BF5AF2]/50 text-[#BF5AF2]">
                                Active
                              </span>
                            )}
                          </div>

                          {chat.lastMessagePreview && (
                            <p className="text-sm text-white/70 line-clamp-2 leading-relaxed">
                              {chat.lastMessagePreview}
                            </p>
                          )}

                          {chat.updatedAtMs > 0 && (
                            <div className="inline-flex items-center gap-1.5 text-xs text-white/50 pt-0.5">
                              <Clock className="w-3 h-3 text-[#A855F7]" />
                              <span>{formatHistoryDate(chat.updatedAtMs)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenChat(chat.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-black border border-[#A855F7]/40 hover:border-[#BF5AF2] text-white cursor-pointer"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3.5 h-3.5 text-[#BF5AF2]" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => onDeleteChat(chat.id, e)}
                          aria-label="Delete chat"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-black border border-[#A855F7]/30 hover:border-[#BF5AF2] text-white/75 hover:text-white cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#BF5AF2]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredImages.length === 0 ? (
            <div className="rounded-3xl bg-[#0A0A0A]/90 border border-[#A855F7]/30 p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-[#BF5AF2]" />
              </div>
              <div className="text-base font-semibold text-white">No saved images yet</div>
              <p className="text-sm text-white/65 max-w-md mx-auto">
                Generate a Real Photo or AI Art image in chat or in Nova Image Studio to see it here.
              </p>
              <button
                type="button"
                onClick={onOpenImageStudio}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Open Image Studio</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredImages.map((img) => (
                <div
                  key={img.id}
                  className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/35 overflow-hidden flex flex-col justify-between"
                >
                  <div className="aspect-square bg-black overflow-hidden">
                    <img
                      src={img.imageUrl}
                      alt={img.prompt || 'Nova generated image'}
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', borderRadius: '12px' }}
                      className="h-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-sm text-white/90 line-clamp-2 leading-relaxed">
                      {img.prompt || 'Nova generated image'}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={img.imageUrl}
                        download={`nova-image-${img.id.slice(0, 6)}.png`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-black border border-[#A855F7]/40 hover:border-[#BF5AF2] text-white"
                      >
                        <Download className="w-3.5 h-3.5 text-[#BF5AF2]" />
                        <span>Download</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => onOpenChat(img.chatId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#BF5AF2] hover:text-white hover:bg-[#A855F7]/20 cursor-pointer"
                      >
                        <span>Open Chat</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
