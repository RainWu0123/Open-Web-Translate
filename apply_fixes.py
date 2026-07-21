import re

# ========== FIX netflix-main.ts ==========
with open('src/entrypoints/netflix-main.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]

    # Add PING/REQUEST_TRACKS before OWT_NETFLIX_FETCH_TTML
    if "      if (data.type === 'OWT_NETFLIX_FETCH_TTML') {" in line:
        new_lines.append("      if (data.type === 'OWT_NETFLIX_PING') {\n")
        new_lines.append("        post('OWT_NETFLIX_PONG', { ts: data.ts });\n")
        new_lines.append("        return;\n")
        new_lines.append("      }\n")
        new_lines.append("\n")
        new_lines.append("      if (data.type === 'OWT_NETFLIX_REQUEST_TRACKS') {\n")
        new_lines.append("        lastSignature = '';\n")
        new_lines.append("        poll();\n")
        new_lines.append("        return;\n")
        new_lines.append("      }\n")
        new_lines.append("\n")
        new_lines.append(line)
        i += 1
        continue

    # Replace the poll() var declarations and add SPA navigation detection
    if "    let lastSignature = '';" in line:
        new_lines.append("    let lastSignature = '';\n")
        new_lines.append("    let lastApiReady = false;\n")
        new_lines.append("    let pollCount = 0;\n")
        new_lines.append("    let lastWatchId = '';\n")
        new_lines.append("\n")
        new_lines.append("    const getWatchId = () => {\n")
        new_lines.append("      const m = window.location.pathname.match(/\\/watch\\/(\\d+)/);\n")
        new_lines.append("      return m ? m[1] : '';\n")
        new_lines.append("    };\n")
        new_lines.append("\n")
        new_lines.append("    const resetProbeState = () => {\n")
        new_lines.append("      const currentWatchId = getWatchId();\n")
        new_lines.append("      if (currentWatchId && currentWatchId !== lastWatchId) {\n")
        new_lines.append("        lastWatchId = currentWatchId;\n")
        new_lines.append("        lastSignature = '';\n")
        new_lines.append("        lastApiReady = false;\n")
        new_lines.append("        pollCount = 0;\n")
        new_lines.append("      }\n")
        new_lines.append("    };\n")
        new_lines.append("\n")
        new_lines.append("    const origPushState = history.pushState;\n")
        new_lines.append("    const origReplaceState = history.replaceState;\n")
        new_lines.append("    history.pushState = function (...args: any[]) {\n")
        new_lines.append("      origPushState.apply(this, args as any);\n")
        new_lines.append("      resetProbeState();\n")
        new_lines.append("    };\n")
        new_lines.append("    history.replaceState = function (...args: any[]) {\n")
        new_lines.append("      origReplaceState.apply(this, args as any);\n")
        new_lines.append("      resetProbeState();\n")
        new_lines.append("    };\n")
        new_lines.append("    window.addEventListener('popstate', resetProbeState);\n")
        new_lines.append("\n")
        # Skip the old declarations
        i += 1
        while i < len(lines) and ("lastApiReady" in lines[i] or "pollCount" in lines[i]):
            i += 1
        continue

    # Add resetProbeState call inside poll()
    if "    const poll = () => {" in line:
        new_lines.append(line)
        i += 1
        # The next line should be "      pollCount += 1;"
        if i < len(lines) and "pollCount += 1;" in lines[i]:
            new_lines.append(lines[i])
            i += 1
            new_lines.append("      resetProbeState();\n")
            continue

    new_lines.append(line)
    i += 1

with open('src/entrypoints/netflix-main.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Fixed netflix-main.ts')

# ========== FIX netflix-caption-adapter.ts ==========
with open('src/adapters/netflix/netflix-caption-adapter.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]

    # Add heartbeat fields
    if "  private lastProbeStatus: { pollCount: number; trackCount: number; ts: number } | null = null;" in line:
        new_lines.append(line)
        new_lines.append("  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;\n")
        new_lines.append("  private lastPingTs = 0;\n")
        new_lines.append("  private missedPings = 0;\n")
        new_lines.append("  private clearGraceMs = 200;\n")
        new_lines.append("  private lastCueRenderTs = 0;\n")
        i += 1
        continue

    # Add startHeartbeat in init
    if "    this.startControlsPoller();" in line and i + 1 < len(lines) and "Defer any DOM writes" in lines[i+1]:
        new_lines.append(line)
        new_lines.append("    this.startHeartbeat();\n")
        i += 1
        continue

    # Add heartbeat methods before setupMainWorldMessageListener
    if "  private setupMainWorldMessageListener() {" in line:
        new_lines.append("  private startHeartbeat() {\n")
        new_lines.append("    if (this.heartbeatTimer) return;\n")
        new_lines.append("    this.heartbeatTimer = setInterval(() => {\n")
        new_lines.append("      this.lastPingTs = Date.now();\n")
        new_lines.append("      try {\n")
        new_lines.append("        window.postMessage({ source: CONTENT_SOURCE, type: 'OWT_NETFLIX_PING', ts: this.lastPingTs }, '*');\n")
        new_lines.append("      } catch { /* ignore */ }\n")
        new_lines.append("      if (this.isActive && this.discoveredTracks.length === 0 && this.channelAlive) {\n")
        new_lines.append("        try {\n")
        new_lines.append("          window.postMessage({ source: CONTENT_SOURCE, type: 'OWT_NETFLIX_REQUEST_TRACKS' }, '*');\n")
        new_lines.append("        } catch { /* ignore */ }\n")
        new_lines.append("      }\n")
        new_lines.append("    }, 3000);\n")
        new_lines.append("  }\n")
        new_lines.append("\n")
        new_lines.append("  private stopHeartbeat() {\n")
        new_lines.append("    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }\n")
        new_lines.append("    this.missedPings = 0;\n")
        new_lines.append("  }\n")
        new_lines.append("\n")
        new_lines.append(line)
        i += 1
        continue

    # Add PONG case
    if "      switch (data.type) {" in line:
        new_lines.append(line)
        i += 1
        # Find and modify OWT_TEST_PING case
        while i < len(lines):
            if "case 'OWT_TEST_PING':" in lines[i]:
                new_lines.append(lines[i])  # case line
                i += 1
                new_lines.append("          this.channelAlive = true;\n")
                new_lines.append("          this.missedPings = 0;\n")
                i += 1  # skip old channelAlive line
                # Keep logger line
                if i < len(lines) and "logger.info" in lines[i]:
                    new_lines.append(lines[i])
                    i += 1
                # Keep break
                if i < len(lines) and "break;" in lines[i]:
                    new_lines.append(lines[i])
                    i += 1
                # Insert PONG case
                new_lines.append("\n")
                new_lines.append("        case 'OWT_NETFLIX_PONG':\n")
                new_lines.append("          this.channelAlive = true;\n")
                new_lines.append("          this.missedPings = 0;\n")
                new_lines.append("          break;\n")
                new_lines.append("\n")
                continue
            new_lines.append(lines[i])
            i += 1
        break

    new_lines.append(line)
    i += 1

with open('src/adapters/netflix/netflix-caption-adapter.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Fixed netflix-caption-adapter.ts (pass 1)')

# Pass 2: fix remaining items in adapter
with open('src/adapters/netflix/netflix-caption-adapter.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix button injection selectors
old_inject = """    const audioSubBtn = document.querySelector('[data-uia="control-audio-subtitle"]');
    const rightControls = document.querySelector('.player-controls .right-controls') || document.querySelector('.player-controls');"""
new_inject = """    const audioSubBtn =
      document.querySelector('[data-uia="control-audio-subtitle"]') ||
      document.querySelector('[data-uia="player-audio-subtitle-button"]') ||
      document.querySelector('[aria-label*="Audio"]') ||
      document.querySelector('[aria-label*="Subtitle"]') ||
      document.querySelector('[aria-label*="音訊"]') ||
      document.querySelector('[aria-label*="字幕"]');

    const rightControls =
      document.querySelector('.player-controls .right-controls') ||
      document.querySelector('.watch-video--bottom-controls .controls') ||
      document.querySelector('[data-uia="controls-standard"]') ||
      document.querySelector('[data-uia="player-controls"]') ||
      document.querySelector('.player-controls');"""
content = content.replace(old_inject, new_inject, 1)

# Fix startSubtitleSync interval
old_sync = """  private startSubtitleSync() {
    this.stopSubtitleSync();
    this.syncTimer = setInterval(() => {
      this.updateSubtitleSync();
    }, 100);
  }"""
new_sync = """  private startSubtitleSync() {
    this.stopSubtitleSync();
    this.syncTimer = setInterval(() => {
      this.updateSubtitleSync();
    }, 50);
  }"""
content = content.replace(old_sync, new_sync, 1)

# Add grace period to updateSubtitleSync
old_update = """  private updateSubtitleSync() {
    if (!this.isActive) return;

    // No TTML loaded → DOM fallback observer handles it.
    if (this.selectedTrackId === 'ai-translate' || this.secondaryCues.length === 0) {
      return;
    }

    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video) return;

    const currentMs = Math.round(video.currentTime * 1000);
    const activeCue = findCueAt(this.secondaryCues, currentMs);

    if (!activeCue) {
      // Between cues: clear overlay. If TTML never worked, fall back to DOM scrape.
      if (this.lastProcessedText !== '') {
        this.clearOverlay();
        this.lastProcessedText = '';
      }
      if (this.shouldUseDomFallback()) {
        this.processCaptions();
      }
      return;
    }

    this.ttmlMatchCount += 1;

    const text = activeCue.text;
    if (this.lastProcessedText === text) {
      return;
    }

    this.lastProcessedText = text;
    void this.translateAndRender(text, currentMs, this.routeGeneration, activeCue);
  }"""
new_update = """  private updateSubtitleSync() {
    if (!this.isActive) return;
    if (this.selectedTrackId === 'ai-translate' || this.secondaryCues.length === 0) return;

    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video) return;

    const currentMs = Math.round(video.currentTime * 1000);
    const activeCue = findCueAt(this.secondaryCues, currentMs);

    if (!activeCue) {
      const sinceLastCue = Date.now() - this.lastCueRenderTs;
      if (this.lastProcessedText !== '' && sinceLastCue > this.clearGraceMs) {
        this.clearOverlay();
        this.lastProcessedText = '';
      }
      if (this.shouldUseDomFallback()) {
        this.processCaptions();
      }
      return;
    }

    this.ttmlMatchCount += 1;
    this.lastCueRenderTs = Date.now();

    const text = activeCue.text;
    if (this.lastProcessedText === text) return;

    this.lastProcessedText = text;
    void this.translateAndRender(text, currentMs, this.routeGeneration, activeCue);
  }"""
content = content.replace(old_update, new_update, 1)

# Fix renderDiagnostic
old_diag = """  private renderDiagnostic(message: string, isError = false) {
    return; // Disabled in production to hide debug/diagnostic messages on screen"""
new_diag = """  private renderDiagnostic(message: string, isError = false) {
    if (!isError) return; // Only show errors to users in production"""
content = content.replace(old_diag, new_diag, 1)

# Add stopHeartbeat to stop()
old_stop = """  stop() {
    this.isActive = false;
    this.forensicProbe.stop();
    this.stopSubtitleSync();"""
new_stop = """  stop() {
    this.isActive = false;
    this.stopHeartbeat();
    this.forensicProbe.stop();
    this.stopSubtitleSync();"""
content = content.replace(old_stop, new_stop, 1)

with open('src/adapters/netflix/netflix-caption-adapter.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed netflix-caption-adapter.ts (pass 2)')
