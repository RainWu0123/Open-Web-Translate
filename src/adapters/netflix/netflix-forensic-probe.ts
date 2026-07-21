import { createLogger } from '@/shared/logger';

const logger = createLogger('NetflixForensicProbe');

interface AuditCue {
  startTime: number;
  endTime: number;
  text: string;
}

interface AuditEvent {
  time: string;
  videoTime: number;
  trackLabel: string;
  trackLanguage: string;
  trackMode: string;
  activeCues: AuditCue[];
}

export class NetflixForensicProbe {
  private videoElement: HTMLVideoElement | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private trackListeners = new Map<TextTrack, () => void>();
  private auditLogs: AuditEvent[] = [];
  private panelHost: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private starting = false;

  constructor() {}

  public start() {
    if (this.checkInterval || this.starting) return;
    this.starting = true;
    logger.info('Starting passive forensic probe...');

    // Never touch DOM until body exists (document_start race).
    const begin = () => {
      if (this.checkInterval) {
        this.starting = false;
        return;
      }
      this.createDebugPanel();
      this.checkInterval = setInterval(() => {
        this.discoverVideo();
      }, 1000);
      this.updateTimer = setInterval(() => {
        this.updateDebugPanel();
      }, 800);
      this.starting = false;
    };

    if (document.body) {
      begin();
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', begin, { once: true });
    } else {
      let attempts = 0;
      const retry = () => {
        attempts += 1;
        if (document.body) begin();
        else if (attempts < 40) setTimeout(retry, 50);
        else this.starting = false;
      };
      retry();
    }
  }

  public stop() {
    logger.info('Stopping forensic probe...');
    this.starting = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.cleanupVideoListeners();
    this.removeDebugPanel();
  }

  private discoverVideo() {
    const currentVideo = document.querySelector('video') as HTMLVideoElement | null;
    if (currentVideo !== this.videoElement) {
      if (this.videoElement) {
        logger.info('Video element changed, cleaning up old listeners');
        this.cleanupVideoListeners();
      }
      this.videoElement = currentVideo;
      if (currentVideo) {
        logger.info('New video element discovered, binding listeners');
        this.setupVideoListeners();
      }
    }
  }

  private setupVideoListeners() {
    if (!this.videoElement) return;

    const tracks = this.videoElement.textTracks;
    
    // Listen for changes in tracks list
    const onTracksChange = () => {
      this.syncTrackListeners();
    };
    this.videoElement.textTracks.addEventListener('change', onTracksChange);
    this.videoElement.textTracks.addEventListener('addtrack', onTracksChange);
    this.videoElement.textTracks.addEventListener('removetrack', onTracksChange);

    // Store this cleanup action
    (this.videoElement as any)._owtTrackChangeCleanup = () => {
      tracks.removeEventListener('change', onTracksChange);
      tracks.removeEventListener('addtrack', onTracksChange);
      tracks.removeEventListener('removetrack', onTracksChange);
    };

    this.syncTrackListeners();
  }

  private syncTrackListeners() {
    if (!this.videoElement) return;

    const tracks = this.videoElement.textTracks;
    const currentTracks = new Set<TextTrack>();

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      currentTracks.add(track);

      if (!this.trackListeners.has(track)) {
        const listener = () => {
          this.handleCueChange(track);
        };
        track.addEventListener('cuechange', listener);
        this.trackListeners.set(track, listener);
        logger.info(`Bound cuechange listener to track: ${track.label} (${track.language})`);
      }
    }

    // Clean up listeners for tracks that are no longer present
    for (const [track, listener] of this.trackListeners.entries()) {
      if (!currentTracks.has(track)) {
        track.removeEventListener('cuechange', listener);
        this.trackListeners.delete(track);
        logger.info(`Cleaned up listener for removed track: ${track.label}`);
      }
    }
  }

  private handleCueChange(track: TextTrack) {
    if (!this.videoElement) return;

    const activeCues = track.activeCues;
    const cuesList: AuditCue[] = [];

    if (activeCues) {
      for (let i = 0; i < activeCues.length; i++) {
        const cue = activeCues[i];
        let text = '';
        if ('text' in cue) {
          text = (cue as any).text;
        } else if ('html' in cue) {
          text = (cue as any).html;
        } else {
          // Fallback serialization for non-vtt cue types
          text = JSON.stringify(cue);
        }
        cuesList.push({
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: text,
        });
      }
    }

    const event: AuditEvent = {
      time: new Date().toISOString(),
      videoTime: this.videoElement.currentTime,
      trackLabel: track.label || 'unknown',
      trackLanguage: track.language || 'unknown',
      trackMode: track.mode,
      activeCues: cuesList,
    };

    this.auditLogs.unshift(event);
    
    // Cap log history to last 50 events
    if (this.auditLogs.length > 50) {
      this.auditLogs.pop();
    }

    this.updateDebugPanel();
  }

  private cleanupVideoListeners() {
    // Unbind track change listeners
    if (this.videoElement && (this.videoElement as any)._owtTrackChangeCleanup) {
      (this.videoElement as any)._owtTrackChangeCleanup();
      delete (this.videoElement as any)._owtTrackChangeCleanup;
    }

    // Unbind individual track listeners
    for (const [track, listener] of this.trackListeners.entries()) {
      track.removeEventListener('cuechange', listener);
    }
    this.trackListeners.clear();
    this.videoElement = null;
  }

  private generateSummaryJSON(): string {
    const tracksSummary: any[] = [];
    if (this.videoElement) {
      const tracks = this.videoElement.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        tracksSummary.push({
          index: i,
          kind: t.kind,
          label: t.label,
          language: t.language,
          mode: t.mode,
          cuesCount: t.cues ? t.cues.length : null,
          activeCuesCount: t.activeCues ? t.activeCues.length : 0,
        });
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      videoState: this.videoElement ? {
        found: true,
        currentTime: this.videoElement.currentTime,
        paused: this.videoElement.paused,
        playbackRate: this.videoElement.playbackRate,
        readyState: this.videoElement.readyState,
      } : { found: false },
      textTracks: tracksSummary,
      recentCueChanges: this.auditLogs.slice(0, 5),
    };

    return JSON.stringify(summary, null, 2);
  }

  private createDebugPanel() {
    if (document.getElementById('owt-forensic-panel-root')) return;

    this.panelHost = document.createElement('div');
    this.panelHost.id = 'owt-forensic-panel-root';
    this.panelHost.style.position = 'fixed';
    this.panelHost.style.bottom = '20px';
    this.panelHost.style.right = '20px';
    this.panelHost.style.zIndex = '2147483647';
    this.panelHost.style.fontFamily = 'monospace';
    
    // Attach open shadow root to avoid styles leak
    this.shadowRoot = this.panelHost.attachShadow({ mode: 'open' });

    // CSS styling
    const style = document.createElement('style');
    style.textContent = `
      .panel-container {
        width: 380px;
        max-height: 400px;
        background: rgba(20, 20, 20, 0.95);
        color: #e2e8f0;
        border: 1px solid #4a5568;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        backdrop-filter: blur(8px);
      }
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        border-bottom: 1px solid #4a5568;
        padding-bottom: 6px;
      }
      .panel-title {
        font-weight: bold;
        font-size: 13px;
        color: #63b3ed;
      }
      .btn {
        background: #3182ce;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-family: monospace;
        transition: background 0.2s;
      }
      .btn:hover {
        background: #2b6cb0;
      }
      .btn:active {
        background: #2c5282;
      }
      .content {
        flex: 1;
        overflow-y: auto;
        font-size: 11px;
        white-space: pre-wrap;
        background: #1a202c;
        padding: 6px;
        border-radius: 4px;
        border: 1px solid #2d3748;
        margin: 0;
      }
    `;

    const container = document.createElement('div');
    container.className = 'panel-container';

    const header = document.createElement('div');
    header.className = 'panel-header';

    const title = document.createElement('span');
    title.className = 'panel-title';
    title.textContent = 'OWT Netflix Probe (Read-Only)';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy JSON';
    copyBtn.addEventListener('click', () => {
      const json = this.generateSummaryJSON();
      navigator.clipboard.writeText(json).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy JSON';
        }, 1500);
      }).catch((err) => {
        logger.error('Failed to copy JSON', err);
        copyBtn.textContent = 'Copy Failed';
      });
    });

    header.appendChild(title);
    header.appendChild(copyBtn);

    const pre = document.createElement('pre');
    pre.className = 'content';
    pre.id = 'summary-json';
    pre.textContent = 'Scanning...';

    container.appendChild(header);
    container.appendChild(pre);

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(container);

    const target = document.body || document.documentElement;
    if (target) {
      target.appendChild(this.panelHost);
      logger.info('Forensic debug panel injected');
    }
  }

  private updateDebugPanel() {
    if (!this.shadowRoot) return;
    const pre = this.shadowRoot.getElementById('summary-json');
    if (pre) {
      pre.textContent = this.generateSummaryJSON();
    }
  }

  private removeDebugPanel() {
    const existing = document.getElementById('owt-forensic-panel-root');
    if (existing) {
      existing.remove();
    }
    this.panelHost = null;
    this.shadowRoot = null;
  }
}
