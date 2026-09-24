import { WorkFrame } from './frame.js';

// Copies the camera frame into a small working image for the stick tracker.
export class FrameGrabber {
  constructor(width = 448) {
    this.width = width;
    this.canvas = document.createElement('canvas');
    this.ctx = null;
    this.frame = null;
  }

  grab(video) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const w = this.width;
    const h = Math.round((w * vh) / vw);
    if (!this.frame || this.frame.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.frame = new WorkFrame(w, h);
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    return this.frame.load(this.ctx.getImageData(0, 0, w, h).data);
  }
}
