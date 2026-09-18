/**
 * Floe Bus — Pulse Scheduler
 *
 * Event-driven priority scheduler using a single active setTimeout.
 * Zero CPU cost when no pulses are approaching.
 *
 * The scheduler maintains a sorted list of upcoming fire times and
 * sets one timeout for the nearest pulse. When it fires, the callback
 * is invoked and the scheduler advances to the next pulse.
 */
export class PulseScheduler {
    onFire;
    entries = [];
    timer = null;
    running = false;
    constructor(onFire) {
        this.onFire = onFire;
    }
    start() {
        this.running = true;
        this.scheduleNext();
    }
    stop() {
        this.running = false;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
    addPulse(pulseId, fireAt) {
        // Remove existing entry for same pulse id
        this.entries = this.entries.filter((e) => e.pulseId !== pulseId);
        this.entries.push({ pulseId, fireAt });
        this.entries.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
        if (this.running)
            this.scheduleNext();
    }
    removePulse(pulseId) {
        this.entries = this.entries.filter((e) => e.pulseId !== pulseId);
        if (this.running)
            this.scheduleNext();
    }
    scheduleNext() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.entries.length === 0)
            return;
        const next = this.entries[0];
        const delay = Math.max(0, next.fireAt.getTime() - Date.now());
        this.timer = setTimeout(() => {
            this.timer = null;
            // Remove the fired entry
            this.entries.shift();
            this.onFire(next.pulseId);
            // Schedule the next one
            if (this.running)
                this.scheduleNext();
        }, delay);
    }
}
