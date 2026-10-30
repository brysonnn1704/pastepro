import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  generateECDHKeyPair, 
  exportPublicKey, 
  importPublicKey, 
  deriveSessionKeys, 
  deriveAuthString, 
  decryptTransfer,
  detectContentType,
  type DerivedSessionKeys,
  type TransferAAD 
} from '@clipper/shared';
import { createSocket, TypedSocket } from '../lib/socket';
import { useToast } from '../lib/toast';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { 
  Copy, 
  Trash2, 
  ShieldAlert, 
  CheckCircle2, 
  Laptop, 
  Smartphone, 
  Info,
  Search,
  ExternalLink,
  Code2,
  FileText,
  AlignLeft
} from 'lucide-react';

interface DecryptedTransfer {
  transferId: string;
  seq: number;
  text: string;
  contentType: 'url' | 'code' | 'multiline' | 'text';
  receivedAt: string;
  copied: boolean;
}

export function PCScreen() {
  const { showToast } = useToast();
  
  // Connection state
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'pairing' | 'connected' | 'expired'>('disconnected');
  
  // Pairing details
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(120);
  
  // Key agreement & verification
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [pcPubSpki, setPcPubSpki] = useState<string | null>(null);
  const [phonePubSpki, setPhonePubSpki] = useState<string | null>(null);
  const [sessionKeys, setSessionKeys] = useState<DerivedSessionKeys | null>(null);
  const [authString, setAuthString] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<boolean>(false);
  
  // Active session details
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [publicPcMode, setPublicPcMode] = useState<boolean>(true);
  
  // Clipboard transfers
  const [transfers, setTransfers] = useState<DecryptedTransfer[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Hidden manual copy textarea fallback
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Initialise Socket & Generate PC Key Pair
  useEffect(() => {
    let s: TypedSocket;

    async function init() {
      const kp = await generateECDHKeyPair();
      const pubSpki = await exportPublicKey(kp.publicKey);
      setKeyPair(kp);
      setPcPubSpki(pubSpki);

      s = createSocket();
      setSocket(s);

      s.on('connect', () => {
        s.emit('pairing:create', { pcPublicKey: pubSpki });
        setStatus('pairing');
      });

      s.on('disconnect', () => {
        setStatus('disconnected');
      });

      s.on('connect_error', () => {
        setStatus('disconnected');
      });

      if (s.connected) {
        s.emit('pairing:create', { pcPublicKey: pubSpki });
        setStatus('pairing');
      }

      s.on('pairing:created', async (data) => {
        setPairingId(data.pairingId);
        setShortCode(data.shortCode);
        setTimeLeft(data.ttlSeconds);

        // QR contains full fragment URL
        const pairUrl = `${window.location.origin}/#pair=${data.pairingId}.${pubSpki}`;
        try {
          const url = await QRCode.toDataURL(pairUrl, {
            margin: 1,
            width: 256,
            color: { dark: '#000000', light: '#FFFFFF' },
          });
          setQrDataUrl(url);
        } catch (err) {
          console.error('QR generation failed', err);
        }
      });

      s.on('pairing:phone_joined', async (data) => {
        setPhonePubSpki(data.phonePublicKey);
        try {
          const phonePubKey = await importPublicKey(data.phonePublicKey);
          const keys = await deriveSessionKeys(kp.privateKey, phonePubKey);
          setSessionKeys(keys);

          const sas = await deriveAuthString(pubSpki, data.phonePublicKey, keys.authKeyBytes);
          setAuthString(sas);
          setConfirmStep(true);
        } catch (err) {
          showToast('Failed to derive shared key with phone', 'error');
        }
      });

      s.on('device:connected', (data) => {
        setSessionId(data.sessionId);
        setDeviceToken(data.deviceToken);
        sessionStorage.setItem('clipper_pc_token', data.deviceToken);
        sessionStorage.setItem('clipper_session_id', data.sessionId);
        s.auth = {
          sessionId: data.sessionId,
          deviceToken: data.deviceToken,
          role: 'pc',
        };
        setStatus('connected');
        setConfirmStep(false);
        showToast('iPhone connected securely', 'success');
      });

      s.on('transfer:received', async (data) => {
        // Will be handled in dedicated effect to access latest sessionKeys
      });

      s.on('session:expired', (data) => {
        setStatus('expired');
        handleWipeData();
        showToast(`Session expired (${data.reason})`, 'info');
      });

      s.on('error', (err) => {
        showToast(err.message, 'error');
      });

      s.connect();
    }

    init();

    return () => {
      if (s) s.disconnect();
    };
  }, []);

  // Update socket listeners when sessionKeys / sessionId change
  useEffect(() => {
    if (!socket || !sessionKeys || !sessionId) return;

    const handleTransfer = async (data: any) => {
      try {
        const aad: TransferAAD = {
          sessionId,
          seq: data.seq,
          transferId: data.transferId,
        };
        const plaintext = await decryptTransfer(
          sessionKeys.encryptionKey,
          data.ciphertext,
          data.nonce,
          aad
        );
        const cType = detectContentType(plaintext);

        const newTransfer: DecryptedTransfer = {
          transferId: data.transferId,
          seq: data.seq,
          text: plaintext,
          contentType: cType,
          receivedAt: new Date(data.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          copied: false,
        };

        setTransfers((prev) => [newTransfer, ...prev]);
        showToast('New clipboard content received', 'info');
      } catch (err) {
        showToast('Decryption error: authentication tag verification failed', 'error');
      }
    };

    socket.off('transfer:received');
    socket.on('transfer:received', handleTransfer);

    return () => {
      socket.off('transfer:received', handleTransfer);
    };
  }, [socket, sessionKeys, sessionId]);

  // Pairing countdown timer
  useEffect(() => {
    if (status !== 'pairing' || timeLeft <= 0) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          setStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status, timeLeft]);

  // User confirms auth string matches
  const handleConfirmAuth = (confirmed: boolean) => {
    if (!socket || !pairingId) return;
    socket.emit('pairing:confirm', { pairingId, confirmed });
  };

  // Safe Wipe & Disconnect
  const handleWipeData = () => {
    setTransfers([]);
    sessionStorage.clear();
    setSessionKeys(null);
    setAuthString(null);
    setSessionId(null);
    setDeviceToken(null);
  };

  const requestNewPairing = async () => {
    if (!socket) return;
    if (!socket.connected) {
      socket.connect();
    }
    let pub = pcPubSpki;
    if (!pub && keyPair) {
      pub = await exportPublicKey(keyPair.publicKey);
      setPcPubSpki(pub);
    }
    if (pub) {
      socket.emit('pairing:create', { pcPublicKey: pub });
      setStatus('pairing');
    }
  };

  const handleDisconnect = () => {
    if (socket) {
      socket.emit('session:disconnect', { reason: 'user_request' });
      socket.disconnect();
    }
    handleWipeData();
    setStatus('disconnected');
    showToast('Session cleanly closed & wiped', 'success');
  };

  // Copy helper with automatic fallback
  const handleCopy = async (item: DecryptedTransfer) => {
    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(item.text);
        success = true;
      } else {
        throw new Error('Clipboard API not available');
      }
    } catch {
      // Manual fallback using hidden textarea
      if (fallbackTextareaRef.current) {
        fallbackTextareaRef.current.value = item.text;
        fallbackTextareaRef.current.select();
        success = document.execCommand('copy');
      }
    }

    if (success) {
      setTransfers((prev) =>
        prev.map((t) => (t.transferId === item.transferId ? { ...t, copied: true } : t))
      );
      showToast('Copied to Windows clipboard (Ctrl+V ready)', 'success');
    } else {
      showToast('Could not copy automatically. Please select text manually.', 'error');
    }
  };

  // Delete transfer
  const handleDelete = (transferId: string) => {
    if (socket && sessionId) {
      socket.emit('transfer:delete', { transferId });
    }
    setTransfers((prev) => prev.filter((t) => t.transferId !== transferId));
  };

  const filteredTransfers = transfers.filter((t) =>
    t.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Top Navigation */}
      <header className="border-b border-default px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-text-inverse font-bold">
            C
          </div>
          <div>
            <h1 className="text-base font-semibold text-primary leading-tight">Clipper</h1>
            <p className="text-xs text-secondary">Private iPhone-to-PC Bridge</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatusPill status={status} />
          {status === 'connected' && (
            <Button variant="danger" size="sm" onClick={handleDisconnect}>
              Disconnect & Wipe
            </Button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Side: Pairing / Security info */}
        <div className="md:col-span-5 flex flex-col gap-6">
          {status !== 'connected' && !confirmStep && (
            <div className="p-6 rounded-xl border border-default bg-surface-elevated flex flex-col items-center text-center">
              <h2 className="text-lg font-semibold text-primary mb-1">Pair your iPhone</h2>
              <p className="text-xs text-secondary mb-5">
                Scan with your iPhone Camera or open Safari
              </p>

              {/* QR Panel */}
              <div className="p-4 bg-white rounded-lg border border-default shadow-sm mb-4 min-h-[224px] min-w-[224px] flex items-center justify-center">
                {status === 'expired' ? (
                  <div className="w-52 h-52 flex flex-col items-center justify-center gap-3 text-secondary p-2">
                    <span className="text-sm font-semibold text-warning">QR Code Expired</span>
                    <Button variant="primary" size="sm" onClick={requestNewPairing}>
                      Generate New QR
                    </Button>
                  </div>
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt="Pairing QR Code" className="w-52 h-52 block" />
                ) : (
                  <div className="w-52 h-52 flex flex-col items-center justify-center gap-2 text-secondary">
                    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Connecting to secure relay...</span>
                  </div>
                )}
              </div>

              {/* Short code entry */}
              <div className="mb-4">
                <span className="text-xs text-secondary uppercase font-semibold tracking-wider">
                  Or enter short code
                </span>
                <div className="font-mono text-2xl tracking-widest text-primary font-bold mt-1">
                  {shortCode || '••••••••'}
                </div>
              </div>

              {/* Countdown timer / reconnect button */}
              {status === 'pairing' ? (
                <div className="text-xs text-secondary">
                  Expires in{' '}
                  <span className={`tabular-nums font-semibold ${timeLeft < 30 ? 'text-warning' : 'text-primary'}`}>
                    {timeLeft}s
                  </span>
                </div>
              ) : status === 'disconnected' ? (
                <Button variant="secondary" size="sm" onClick={requestNewPairing}>
                  Connect & Generate QR
                </Button>
              ) : null}
            </div>
          )}

          {/* Confirm Step (SAS Verification) */}
          {confirmStep && authString && (
            <div className="p-6 rounded-xl border-2 border-accent bg-accent-subtle/20 flex flex-col items-center text-center">
              <CheckCircle2 className="w-10 h-10 text-accent mb-2" />
              <h2 className="text-lg font-semibold text-primary">Verify Authentication Code</h2>
              <p className="text-xs text-secondary max-w-xs mt-1 mb-4">
                Confirm this 6-digit number matches exactly what is displayed on your iPhone.
              </p>

              <div className="font-mono text-4xl tracking-widest font-extrabold text-accent py-3 px-6 bg-surface rounded-lg border border-default mb-6 shadow-sm">
                {authString}
              </div>

              <div className="flex gap-3 w-full">
                <Button variant="secondary" size="md" className="flex-1" onClick={() => handleConfirmAuth(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="md" className="flex-1" onClick={() => handleConfirmAuth(true)}>
                  Matches
                </Button>
              </div>
            </div>
          )}

          {/* Connected state status summary */}
          {status === 'connected' && (
            <div className="p-5 rounded-xl border border-default bg-surface-elevated flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-success-subtle text-success">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-primary">iPhone Connected</h3>
                  <p className="text-xs text-secondary">End-to-End Encrypted (AES-256-GCM)</p>
                </div>
              </div>

              <div className="text-xs text-secondary space-y-1.5 border-t border-default pt-3">
                <div className="flex justify-between">
                  <span>Session Type:</span>
                  <span className="font-medium text-primary">Ephemeral In-Memory</span>
                </div>
                <div className="flex justify-between">
                  <span>Idle Expiry:</span>
                  <span className="font-medium text-primary">30 Minutes</span>
                </div>
                <div className="flex justify-between">
                  <span>Public PC Mode:</span>
                  <span className="font-medium text-accent">Active</span>
                </div>
              </div>
            </div>
          )}

          {/* Public PC Safety Checklist */}
          <div className="p-5 rounded-xl border border-default bg-surface-elevated">
            <div className="flex items-center gap-2 mb-3 text-warning font-semibold text-sm">
              <ShieldAlert className="w-4 h-4" />
              <span>Public PC Safe Habits</span>
            </div>
            <ul className="text-xs text-secondary space-y-2">
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold">•</span>
                <span>Click <strong>Disconnect & Wipe</strong> before walking away.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold">•</span>
                <span>Press <strong>Win + V</strong> to clear any Windows OS clipboard history.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold">•</span>
                <span>Close the browser tab completely when finished.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Right Side: Clipboard Inbox */}
        <div className="md:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-primary">Incoming Clipboard Items</h2>
            <div className="relative w-48">
              <Search className="w-4 h-4 text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-surface-elevated border border-default rounded-md focus:border-accent text-primary"
              />
            </div>
          </div>

          {filteredTransfers.length === 0 ? (
            <div className="flex-1 min-h-[360px] border border-dashed border-default rounded-xl p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center text-secondary mb-3">
                <Copy className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-medium text-primary mb-1">No items received yet</h3>
              <p className="text-xs text-secondary max-w-xs">
                When you paste text on your iPhone and tap Send, it will securely appear here instantly.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredTransfers.map((item) => (
                <div
                  key={item.transferId}
                  className="p-4 rounded-xl border border-default bg-surface-elevated flex flex-col gap-3 hover:border-border-strong transition-all"
                >
                  <div className="flex items-center justify-between text-xs text-secondary border-b border-default pb-2">
                    <span className="inline-flex items-center gap-1 font-mono uppercase text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-primary">
                      {item.contentType === 'url' && <ExternalLink className="w-3 h-3" />}
                      {item.contentType === 'code' && <Code2 className="w-3 h-3" />}
                      {item.contentType === 'multiline' && <AlignLeft className="w-3 h-3" />}
                      {item.contentType === 'text' && <FileText className="w-3 h-3" />}
                      {item.contentType}
                    </span>
                    <span>{item.receivedAt} • {item.text.length} chars</span>
                  </div>

                  <pre className="font-mono text-sm text-primary max-h-36 overflow-y-auto whitespace-pre-wrap break-all p-2 rounded bg-surface border border-default/50">
                    {item.text}
                  </pre>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => handleDelete(item.transferId)}
                      className="text-xs text-danger/80 hover:text-danger flex items-center gap-1 p-1 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>

                    <Button
                      variant={item.copied ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleCopy(item)}
                      className="gap-1.5 min-w-[100px]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{item.copied ? 'Copied' : 'Copy'}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Hidden fallback textarea for non-secure manual execCommand copy */}
      <textarea ref={fallbackTextareaRef} className="sr-only" aria-hidden="true" tabIndex={-1} />
    </div>
  );
}
