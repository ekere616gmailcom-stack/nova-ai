import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  FileImage,
  FolderOpen,
  MessageSquare,
  Search,
  Trash2,
} from 'lucide-react';
import { ChatSession, SavedImageEntry } from '../types';

export interface SpaceUploadedFile {
  id: string;
  chatId: string;
  name: string;
  dataUrl: string;
  createdAtMs: number;
}

interface SpaceViewProps {
  chats: ChatSession[];
  images: SavedImageEntry[];
  uploadedFiles: SpaceUploadedFile[];
  onOpenChat: (chatId: string) => void;
  onDeleteChat: (chatId: string, e: React.MouseEvent) => Promise<void>;
  onBackToChat: () => void;
}

export const SpaceView: React.FC<SpaceViewProps> = ({
  chats,
  images,
  uploadedFiles,
  onOpenChat,
  onDeleteChat,
  onBackToChat,
}) => {
  const [tab, setTab] = useState<'all' | 'chats' | 'files'>('all');
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();

  const filteredChats = chats.filter(
    (c) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.lastMessagePreview.toLowerCase().includes(q)
  );

  const combinedFiles = [
    ...uploadedFiles.map((f) => ({
      id: f.id,
      chatId: f.chatId,
      label: f.name || 'Uploaded file',
      previewUrl: f.dataUrl,
      kind: 'Uploaded' as const,
      createdAtMs: f.createdAtMs,
    })),
    ...images.map((img) => ({
      id: img.id,
      chatId: img.chatId,
      label: img.prompt || 'Generated image',
      previewUrl: img.imageUrl,
      kind: 'Generated' as const,
      createdAtMs: img.createdAtMs,
    })),
  ]
    .filter((item) => !q || item.label.toLowerCase().includes(q))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const showChats = tab === 'all' || tab === 'chats';
  const showFiles = tab === 'all' || tab === 'files';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6 sm:py-10 bg-[#0A0A0F]">
      <div className="max-w-[900px] mx-auto space-y-6 pb-8">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 text-sm font-medium text-purple-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Chat</span>
          </button>

          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400">
            <span>{chats.length} chats</span>
            <span>·</span>
            <span>{combinedFiles.length} files</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Nova Space
            </h1>
            <p className="text-sm text-slate-400 mt-1.5">
              Your saved conversations, uploaded attachments, and generated media in one workspace.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#12121A] border border-white/10 self-start sm:self-auto">
            {(['all', 'chats', 'files'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium capitalize transition-colors cursor-pointer ${
                  tab === key
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {/* Search Space */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved chats and files..."
            className="w-full rounded-2xl bg-[#12121A] border border-white/10 ps-10 pe-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        {/* Saved Chats Section */}
        {showChats && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Saved Chats ({filteredChats.length})</span>
            </div>

            {filteredChats.length === 0 ? (
              <div className="rounded-2xl bg-[#12121A] border border-white/8 p-6 text-center text-xs text-slate-400">
                No saved chats match your filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => onOpenChat(chat.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onOpenChat(chat.id);
                    }}
                    className="group rounded-2xl bg-[#1A1A22] border border-white/10 hover:border-purple-500/45 p-4 flex items-start justify-between gap-3 transition-all cursor-pointer"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="w-4 h-4 text-purple-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {chat.title}
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {chat.lastMessagePreview || 'Open conversation'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => void onDeleteChat(chat.id, e)}
                      aria-label={`Delete ${chat.title}`}
                      className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Files & Media Section */}
        {showFiles && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <FileImage className="w-3.5 h-3.5 text-purple-400" />
              <span>Files &amp; Media ({combinedFiles.length})</span>
            </div>

            {combinedFiles.length === 0 ? (
              <div className="rounded-2xl bg-[#12121A] border border-white/8 p-6 text-center text-xs text-slate-400">
                Uploaded images and generated files will appear here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {combinedFiles.map((file) => (
                  <div
                    key={`${file.kind}-${file.id}`}
                    onClick={() => onOpenChat(file.chatId)}
                    className="rounded-2xl bg-[#1A1A22] border border-white/10 hover:border-purple-500/45 p-3 flex items-center gap-3 transition-all cursor-pointer"
                  >
                    <img
                      src={file.previewUrl}
                      alt={file.label}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-xl object-cover bg-[#0A0A0F] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white truncate">
                        {file.label}
                      </div>
                      <div className="text-[11px] text-purple-300 mt-0.5">{file.kind}</div>
                    </div>
                    <a
                      href={file.previewUrl}
                      download={`nova-file-${file.id.slice(0, 6)}.png`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Download file"
                      className="p-2 rounded-xl bg-white/6 hover:bg-white/12 text-slate-200 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
