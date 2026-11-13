import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Globe,
  Loader2,
  Maximize2,
  Pencil,
  Send,
  X,
} from 'lucide-react';

export interface BuiltAppPayload {
  title: string;
  appType: 'website' | 'app';
  summary: string;
  html: string;
}

interface AppBuilderCardProps {
  app: BuiltAppPayload;
  onEditApp?: (editInstruction: string, currentHtml: string) => void;
  isEditing?: boolean;
}

const QUICK_EDITS = [
  'Change colour to blue',
  'Add contact form',
  'Add About page',
  'Add my name and phone',
];

export const AppBuilderCard: React.FC<AppBuilderCardProps> = ({
  app,
  onEditApp,
  isEditing = false,
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(app.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadHtml = () => {
    const slug =
      app.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'nova-app';
    const blob = new Blob([app.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSubmitEdit = (instruction: string) => {
    const clean = instruction.trim();
    if (!clean || !onEditApp || isEditing) return;
    setEditText('');
    setEditOpen(false);
    onEditApp(clean, app.html);
  };

  return (
    <>
      <div className="rounded-2xl bg-[#0F1018] border border-purple-500/30 overflow-hidden shadow-[0_12px_36px_-12px_rgba(124,58,237,0.4)]">
        {/* Builder Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[#151622] border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-purple-600/25 border border-purple-400/35 flex items-center justify-center shrink-0">
              <Globe className="w-3.5 h-3.5 text-purple-300" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{app.title}</div>
              <div className="text-[10px] text-purple-300 uppercase tracking-wider">
                {app.appType === 'app' ? 'Interactive Mini App' : 'Live Website'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white'
                  : 'bg-white/6 text-slate-300 hover:text-white'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Live Preview</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
                viewMode === 'code'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white'
                  : 'bg-white/6 text-slate-300 hover:text-white'
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>Code</span>
            </button>

            <button
              type="button"
              onClick={() => setFullScreenOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-white/6 hover:bg-white/12 text-slate-200 transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3 h-3 text-sky-300" />
              <span className="hidden sm:inline">Full Screen</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopyCode()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-white/6 hover:bg-white/12 text-slate-200 transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-purple-300" />
              )}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-white/6 hover:bg-white/12 text-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3 text-emerald-300" />
              <span>Download</span>
            </button>

            {onEditApp && (
              <button
                type="button"
                onClick={() => setEditOpen((v) => !v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
                  editOpen
                    ? 'bg-sky-500/25 border border-sky-400/50 text-sky-100'
                    : 'bg-white/6 hover:bg-white/12 text-slate-200'
                }`}
              >
                <Pencil className="w-3 h-3 text-amber-300" />
                <span>Edit</span>
              </button>
            )}
          </div>
        </div>

        {/* Inline Edit Bar */}
        {editOpen && onEditApp && (
          <div className="px-3.5 py-3 bg-[#131522] border-b border-white/10 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_EDITS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={isEditing}
                  onClick={() => handleSubmitEdit(preset)}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-white/6 hover:bg-purple-500/25 border border-white/10 text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {preset}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitEdit(editText);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder='e.g. "Change colour to blue" or "Add my name and phone"'
                className="flex-1 rounded-xl bg-[#0A0A0F] border border-white/12 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
              />
              <button
                type="submit"
                disabled={!editText.trim() || isEditing}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white cursor-pointer disabled:opacity-50"
              >
                {isEditing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                <span>Apply</span>
              </button>
            </form>
          </div>
        )}

        {/* Preview Window OR Code Inspector */}
        {viewMode === 'preview' ? (
          <div className="w-full h-[390px] sm:h-[460px] bg-white">
            <iframe
              title={app.title}
              srcDoc={app.html}
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              className="w-full h-full border-0 block"
            />
          </div>
        ) : (
          <div className="w-full max-h-[420px] overflow-auto bg-[#08090F] p-4">
            <pre className="text-[11px] leading-relaxed font-mono text-purple-100 whitespace-pre-wrap break-all">
              <code>{app.html}</code>
            </pre>
          </div>
        )}
      </div>

      {/* Full Screen Interactive Preview Overlay */}
      {fullScreenOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#06070B]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#0D0E16] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-sm font-semibold text-white truncate">{app.title}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/8 hover:bg-white/15 text-white cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadHtml}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download HTML</span>
              </button>
              <button
                type="button"
                onClick={() => setFullScreenOpen(false)}
                aria-label="Close full screen"
                className="p-2 rounded-xl bg-white/8 hover:bg-white/15 text-slate-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 bg-white">
            <iframe
              title={`${app.title} Full Screen`}
              srcDoc={app.html}
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              className="w-full h-full border-0 block"
            />
          </div>
        </div>
      )}
    </>
  );
};
