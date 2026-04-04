// ═══════════════════════════════════════════════════════════════════
//  heap.js  —  Max-Heap (Priority Queue) + Priority Scoring
//  Used on the frontend to keep the sorted queue in-memory
//  (mirrors the priority logic in backend/routes/orders.py)
// ═══════════════════════════════════════════════════════════════════

const TYPE_SCORE = { express: 50, standard: 25, economy: 10 };
const ZONE_SCORE = { A: 15,  B: 10,  C: 5  };
const TIER_SCORE = { premium: 20, regular: 10, basic: 5 };

function calcPriority(order) {
  const ageFactor = Math.min((order.age_minutes || 0) * 0.4, 30);
  return TYPE_SCORE[order.type] + ZONE_SCORE[order.zone] + TIER_SCORE[order.tier] + ageFactor;
}

class MaxHeap {
  constructor() { this.heap = []; }
  size()  { return this.heap.length; }
  peek()  { return this.heap[0] || null; }

  insert(order) {
    this.heap.push(order);
    this._bubbleUp(this.heap.length - 1);
  }

  extractMax() {
    if (!this.heap.length) return null;
    const max  = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length) { this.heap[0] = last; this._sinkDown(0); }
    return max;
  }

  buildFrom(arr) {
    this.heap = [...arr];
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) this._sinkDown(i);
  }

  snapshot() {
    return [...this.heap].sort((a, b) => b.priority - a.priority);
  }

  _bubbleUp(i) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.heap[p].priority >= this.heap[i].priority) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }

  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let largest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.heap[l].priority > this.heap[largest].priority) largest = l;
      if (r < n && this.heap[r].priority > this.heap[largest].priority) largest = r;
      if (largest === i) break;
      [this.heap[i], this.heap[largest]] = [this.heap[largest], this.heap[i]];
      i = largest;
    }
  }
}
