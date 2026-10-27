import React, { useState, useEffect, useRef } from 'react';
import { 
  generateECDHKeyPair, 
  exportPublicKey, 
  importPublicKey, 
  deriveSessionKeys, 
  deriveAuthString, 
  encryptTransfer, 
  detectContentType,
  type DerivedSessionKeys,
  type TransferAAD 
} from '@clipper/shared';
import { createSocket, TypedSocket } from '../lib/socket';
import { useToast } from '../lib/toast';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { QRScanner } from '../components/QRScanner';
import { 
  Send, 
  ClipboardPaste, 
  Trash2, 
  Camera, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  ExternalLink,
  Code2,
  FileText,
  AlignLeft,
  X
} from 'lucide-react';

export function IPhoneScreen() {
  const { showToast } = useToast();

  // Socket & State
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'pairing' | 'connected' | 'expired'>('disconnected');
  
  // Pairing Data
  const [manualCode, setManualCode] = useState<string>('');
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pcPubSpki, setPcPubSpki] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState<boolean>(false);
  
  // Crypto Session
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [phonePubSpki, setPhonePubSpki] = useState<string | null>(null);
  const [sessionKeys, setSessionKeys] = useState<DerivedSessionKeys | null>(null);
  const [authString, setAuthString] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<boolean>(false);
  
  // Active Session
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [seqCounter, setSeqCounter] = useState<number>(0);
  
  // Clipboard text state
  const [text, setText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [recentTransfers, setRecentTransfers] = useState<{ id: string; preview: string; time: string }[]>([]);

  // 1. Initialise Socket and Check for URL Fragment (#pair=id.key)
  useEffect(() => {
    let s: TypedSocket;

    async function init() {
      const kp = await generateECDHKeyPair();
      const pubSpki = await exportPublicKey(kp.publicKey);
      setKeyPair(kp);
      setPhonePubSpki(pubSpki);

      s = createSocket();
      setSocket(s);

      s.on('connect', () => {
        // Parse fragment if present from QR camera launch
        const hash = window.location.hash;
        if (hash.startsWith('#pair=')) {
          const payload = hash.replace('#pair=', '');
          const [pId, pcKey] = payload.split('.');
          if (pId && pcKey) {
            setPairingId(pId);
            setPcPubSpki(pcKey);
            s.emit('pairing:join', { pairingId: pId, phonePublicKey: pubSpki });
            setStatus('pairing');
          }
        }
      });

      s.on('pairing:pc_key', async (data) => {
        setPcPubSpki(data.pcPublicKey);
        try {
          const pcPubKey = await importPublicKey(data.pcPublicKey);
          const keys = await deriveSessionKeys(kp.privateKey, pcPubKey);
          setSessionKeys(keys);

          const sas = await deriveAuthString(data.pcPublicKey, pubSpki, keys.authKeyBytes);
          setAuthString(sas);
          setConfirmStep(true);
        } catch (err) {
          showToast('Failed to derive encryption key', 'error');
        }
      });

      s.on('device:connected', (data) => {
        setSessionId(data.sessionId);
        setDeviceToken(data.deviceToken);
        // Persist token in socket auth so automatic reconnect on un-minimize works seamlessly
        s.auth = {
          sessionId: data.sessionId,
          deviceToken: data.deviceToken,
          role: 'phone',
        };
        setStatus('connected');
        setConfirmStep(false);
        showToast('Paired with PC successfully!', 'success');
      });

      s.on('session:expired', (data) => {
        setStatus('expired');
        handleReset();
        showToast(`Session expired (${data.reason})`, 'info');
      });

      s.on('error', (err) => {
        showToast(err.message, 'error');
      });

      // Handle visibility changes when user switches apps or minimizes browser on iOS
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          if (!s.connected) {
            s.connect();
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pageshow', handleVisibilityChange);

      s.connect();

      cleanup = () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('pageshow', handleVisibilityChange);
        s.disconnect();
      };
    }

    let cleanup: (() => void) | undefined;
    init().then((fn) => {
      // init completed
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const handleReset = () => {
    setPairingId(null);
    setPcPubSpki(null);
    setSessionKeys(null);
    setAuthString(null);
    setConfirmStep(false);
    setSessionId(null);
    setDeviceToken(null);
    setText('');
  };

  // Join pairing manually via code or QR
  const handleJoinWithCode = (codeStr: string) => {
    if (!socket || !phonePubSpki) return;
    setStatus('pairing');
    // If the input was a full URL or fragment
    if (codeStr.includes('#pair=')) {
      const fragment = codeStr.split('#pair=')[1];
      if (fragment) {
        const [pId, pcKey] = fragment.split('.');
        if (pId && pcKey) {
          setPairingId(pId);
          setPcPubSpki(pcKey);
          socket.emit('pairing:join', { pairingId: pId, phonePublicKey: phonePubSpki });
          return;
        }
      }
    }

    showToast('Please scan the QR code for full E2EE key agreement', 'info');
  };

  const handleConfirm = (confirmed: boolean) => {
    if (!socket || !pairingId) return;
    socket.emit('pairing:confirm', { pairingId, confirmed });
  };

  // Paste from iPhone Clipboard
  const handlePaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        setText(clipText);
        showToast('Pasted from clipboard', 'info');
      } else {
        throw new Error('Direct clipboard reading not available');
      }
    } catch {
      showToast('Please tap and hold the box to paste manually', 'info');
    }
  };

  // Encrypt and Send
  const handleSend = async () => {
    if (!text.trim() || !socket || !sessionKeys || !sessionId) return;
    setSending(true);

    try {
      const currentSeq = seqCounter;
      const transferId = crypto.randomUUID();
      const aad: TransferAAD = {
        sessionId,
        seq: currentSeq,
        transferId,
      };

      const { ciphertext, nonce } = await encryptTransfer(
        sessionKeys.encryptionKey,
        text,
        aad
      );

      socket.emit('transfer:send', {
        transferId,
        seq: currentSeq,
        ciphertext,
        nonce,
        byteLength: new TextEncoder().encode(ciphertext).length,
      });

      setSeqCounter((prev) => prev + 1);
      setRecentTransfers((prev) => [
        {
          id: transferId,
          preview: text.slice(0, 32) + (text.length > 32 ? '...' : ''),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev.slice(0, 4),
      ]);

      setText('');
      showToast('Sent to Windows PC!', 'success');
    } catch (err) {
      showToast('Failed to encrypt and send', 'error');
    } finally {
      setSending(false);
    }
  };

  const contentType = detectContentType(text);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-surface safe-top safe-bottom">
      {/* Header */}
      <header className="border-b border-default px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-text-inverse font-bold text-sm">
            C
          </div>
          <span className="font-semibold text-sm text-primary">Clipper</span>
        </div>

        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          {status === 'connected' && (
            <button
              onClick={() => {
                if (socket) socket.emit('session:disconnect', { reason: 'user_request' });
                handleReset();
                setStatus('disconnected');
              }}
              className="p-1.5 text-secondary hover:text-danger rounded-md"
              aria-label="Disconnect"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 flex flex-col gap-4 max-w-md mx-auto w-full">
        {status !== 'connected' && !confirmStep && (
          <div className="p-5 rounded-xl border border-default bg-surface-elevated flex flex-col items-center text-center">
            <h2 className="text-base font-semibold text-primary mb-1">Bridge to your PC</h2>
            <p className="text-xs text-secondary mb-4">
              Scan the QR code displayed on your PC browser
            </p>

            <Button
              variant="primary"
              size="lg"
              className="w-full gap-2 mb-4"
              onClick={() => setShowScanner(true)}
            >
              <Camera className="w-5 h-5" />
              <span>Scan PC QR Code</span>
            </Button>

            <div className="w-full flex items-center gap-2 my-2">
              <div className="h-px bg-default flex-1" />
              <span className="text-[10px] uppercase font-bold text-tertiary">Or manual pair</span>
              <div className="h-px bg-default flex-1" />
            </div>

            <div className="w-full flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Paste pairing URL..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-surface border border-default rounded-md text-primary"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={() => handleJoinWithCode(manualCode)}
                disabled={!manualCode}
              >
                Pair
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation Step (SAS) */}
        {confirmStep && authString && (
          <div className="p-5 rounded-xl border-2 border-accent bg-accent-subtle/20 flex flex-col items-center text-center">
            <ShieldCheck className="w-8 h-8 text-accent mb-2" />
            <h2 className="text-base font-semibold text-primary">Verify Matching Code</h2>
            <p className="text-xs text-secondary mt-1 mb-4">
              Check that this code matches the PC screen to prevent relay tampering.
            </p>

            <div className="font-mono text-3xl font-extrabold tracking-widest text-accent py-2 px-5 bg-surface rounded-lg border border-default mb-5 shadow-sm">
              {authString}
            </div>

            <div className="flex gap-3 w-full">
              <Button variant="secondary" size="md" className="flex-1" onClick={() => handleConfirm(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="md" className="flex-1" onClick={() => handleConfirm(true)}>
                Matches
              </Button>
            </div>
          </div>
        )}

        {/* Text Clipboard Editor */}
        {status === 'connected' && (
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-secondary">
              <span className="inline-flex items-center gap-1 font-mono uppercase text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-primary">
                {contentType === 'url' && <ExternalLink className="w-3 h-3" />}
                {contentType === 'code' && <Code2 className="w-3 h-3" />}
                {contentType === 'multiline' && <AlignLeft className="w-3 h-3" />}
                {contentType === 'text' && <FileText className="w-3 h-3" />}
                {contentType}
              </span>
              <span className="tabular-nums font-mono">{text.length} chars</span>
            </div>

            <div className="relative flex-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste or type content here to send to your PC..."
                className="w-full h-full min-h-[180px] p-3 text-sm rounded-xl border border-default bg-surface-elevated text-primary focus:border-accent resize-none outline-none font-sans"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={handlePaste}
                className="gap-1.5 flex-1"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>Paste</span>
              </Button>

              <Button
                variant="secondary"
                size="md"
                onClick={() => setText('')}
                disabled={!text}
                className="px-3"
                aria-label="Clear text"
              >
                <Trash2 className="w-4 h-4 text-secondary" />
              </Button>

              <Button
                variant="primary"
                size="md"
                onClick={handleSend}
                disabled={!text.trim() || sending}
                loading={sending}
                className="gap-1.5 flex-1"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </Button>
            </div>

            {/* Recent Transfers List */}
            {recentTransfers.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
                  Recent Sent Items
                </h3>
                <div className="flex flex-col gap-1.5">
                  {recentTransfers.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg border border-default bg-surface-elevated text-xs flex justify-between items-center"
                    >
                      <span className="text-primary truncate font-mono max-w-[200px]">
                        {item.preview}
                      </span>
                      <span className="text-tertiary">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* QR Scanner Modal */}
      {showScanner && (
        <QRScanner
          onScan={(data) => {
            setShowScanner(false);
            handleJoinWithCode(data);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
