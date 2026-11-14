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
      <div className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/40 overflow-hidden shadow-[0_0_32px_-12px_rgba(191,90,242,0.45)]">
        {/* Builder Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-black border-b border-[#A855F7]/25">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/45 flex items-center justify-center shrink-0">
              <Globe className="w-3.5 h-3.5 text-[#BF5AF2]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{app.title}</div>
              <div className="text-[10px] text-[#BF5AF2] uppercase tracking-wider">
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
                  ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow'
                  : 'bg-[#0A0A0A] border border-[#A855F7]/30 text-white/75 hover:text-white'
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
                  ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow'
                  : 'bg-[#0A0A0A] border border-[#A855F7]/30 text-white/75 hover:text-white'
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>Code</span>
            </button>

            <button
              type="button"
              onClick={() => setFullScreenOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-[#0A0A0A] border border-[#A855F7]/30 hover:border-[#BF5AF2] text-white transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3 h-3 text-[#BF5AF2]" />
              <span className="hidden sm:inline">Full Screen</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopyCode()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-[#0A0A0A] border border-[#A855F7]/30 hover:border-[#BF5AF2] text-white transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="w-3 h-3 text-[#BF5AF2]" />
              ) : (
                <Copy className="w-3 h-3 text-[#A855F7]" />
              )}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-[#0A0A0A] border border-[#A855F7]/30 hover:border-[#BF5AF2] text-white transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3 text-[#BF5AF2]" />
              <span>Download</span>
            </button>

            {onEditApp && (
              <button
                type="button"
                onClick={() => setEditOpen((v) => !v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer border ${
                  editOpen
                    ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white'
                    : 'bg-[#0A0A0A] border-[#A855F7]/30 hover:border-[#BF5AF2] text-white'
                }`}
              >
                <Pencil className="w-3 h-3 text-[#BF5AF2]" />
                <span>Edit</span>
              </button>
            )}
          </div>
        </div>

        {/* Inline Edit Bar */}
        {editOpen && onEditApp && (
          <div className="px-3.5 py-3 bg-[#0A0A0A] border-b border-[#A855F7]/25 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_EDITS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={isEditing}
                  onClick={() => handleSubmitEdit(preset)}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-black hover:bg-[#A855F7]/25 border border-[#A855F7]/35 text-white transition-colors cursor-pointer disabled:opacity-50"
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
                placeholder='e.g. "Change colour to purple" or "Add my name and phone"'
                className="flex-1 rounded-xl bg-black border border-[#A855F7]/35 px-3 py-1.5 text-xs text-white placeholder:text-white/45 focus:outline-none focus:border-[#BF5AF2]"
              />
              <button
                type="submit"
                disabled={!editText.trim() || isEditing}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow cursor-pointer disabled:opacity-50"
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
          <div className="w-full max-h-[420px] overflow-auto bg-black p-4">
            <pre className="text-[11px] leading-relaxed font-mono text-white whitespace-pre-wrap break-all">
              <code>{app.html}</code>
            </pre>
          </div>
        )}
      </div>

      {/* Full Screen Interactive Preview Overlay */}
      {fullScreenOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#A855F7]/30 bg-[#0A0A0A] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="w-4 h-4 text-[#BF5AF2] shrink-0" />
              <span className="text-sm font-semibold text-white truncate">{app.title}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-black border border-[#A855F7]/35 hover:border-[#BF5AF2] text-white cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#BF5AF2]" /> : <Copy className="w-3.5 h-3.5 text-[#A855F7]" />}
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadHtml}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download HTML</span>
              </button>
              <button
                type="button"
                onClick={() => setFullScreenOpen(false)}
                aria-label="Close full screen"
                className="p-2 rounded-xl bg-black border border-[#A855F7]/30 text-white/75 hover:text-white hover:border-[#BF5AF2] cursor-pointer"
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
