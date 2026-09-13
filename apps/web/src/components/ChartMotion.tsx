import { useEffect } from 'react';
import { useDecor } from '../lib/motion';

// Animate only plotted marks. Labels, tables, reference bands and hit targets remain stationary.
// The observer also covers workspaces loaded after sign-in and charts added by record filters.
const plots = '.chart-plot, .reading-plot, .earn-bar, .fc-track, .alloc-bar, .vetting-progress, .s-segments, .share-cell';
export function ChartMotion() {
 useDecor();
 useEffect(() => {
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const records = new Map<Element, { visible: boolean; entered: boolean; animations: Animation[] }>();
  const allowed = () => !query.matches && !document.hidden && document.documentElement.dataset.decor === 'on';
  const settle = (record: { animations: Animation[] }) => {
   for (const animation of record.animations) animation.cancel();
   record.animations = [];
  };
  const reveal = (plot: Element) => {
   const record = records.get(plot)!;
   if (!record.visible || record.entered) return;
   record.entered = true;
   if (!allowed()) return;
   const animate = (mark: Element, frames: Keyframe[], duration = 700, delay = 0) => {
    record.animations.push(mark.animate(frames, { duration, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));
   };
   if (plot.matches('.chart-plot')) {
    plot.querySelectorAll<SVGPathElement>('.chart-line').forEach(line => {
     const length = line.getTotalLength();
     animate(line, [{ strokeDasharray: `${length} ${length}`, strokeDashoffset: length }, { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }], 850);
    });
    plot.querySelectorAll('.chart-area').forEach(area => animate(area, [{ opacity: 0 }, { opacity: getComputedStyle(area).opacity }], 550, 120));
    const points = plot.querySelectorAll('circle');
    points.forEach((point, i) => animate(point, [{ opacity: 0 }, { opacity: 1 }], 160, 650 * i / Math.max(points.length - 1, 1)));
   } else {
    const vertical = plot.matches('.reading-plot');
    // Only marks, never the percentages printed beside the dispatch allocation bars.
    const marks = plot.querySelectorAll(':scope > i, :scope > div');
    marks.forEach((mark, i) => animate(mark, [
     { transform: vertical ? 'scaleY(0)' : 'scaleX(0)', transformOrigin: vertical ? 'center bottom' : 'left center' },
     { transform: vertical ? 'scaleY(1)' : 'scaleX(1)', transformOrigin: vertical ? 'center bottom' : 'left center' }
    ], 650, Math.min(i * 65, 260)));
   }
  };
  const visibility = new IntersectionObserver(entries => {
   for (const entry of entries) {
    const record = records.get(entry.target);
    if (!record) continue;
    record.visible = entry.isIntersecting;
    if (record.visible) reveal(entry.target); else settle(record);
   }
  }, { threshold: 0.1 });
  const register = (node: Element) => {
   const found = [...node.querySelectorAll(plots), ...(node.matches(plots) ? [node] : [])];
   for (const plot of found) if (!records.has(plot)) {
    records.set(plot, { visible: false, entered: false, animations: [] });
    visibility.observe(plot);
   }
  };
  const changes = new MutationObserver(mutations => {
   const updated = new Set<Element>();
   for (const mutation of mutations) {
    if (mutation.type === 'childList') mutation.addedNodes.forEach(node => { if (node instanceof Element) register(node); });
    if (mutation.target instanceof Element) {
     const plot = mutation.target.closest(plots);
     if (plot && records.has(plot)) updated.add(plot);
    }
   }
   for (const [plot, record] of records) if (!plot.isConnected) { settle(record); visibility.unobserve(plot); records.delete(plot); }
   for (const plot of updated) {
    const record = records.get(plot);
    if (record) { settle(record); record.entered = false; reveal(plot); }
   }
  });
  const preference = () => { if (!allowed()) records.forEach(settle); };
  const controls = new MutationObserver(preference);
  register(document.body);
  changes.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['d', 'style', 'class'] });
  controls.observe(document.documentElement, { attributes: true, attributeFilter: ['data-decor'] });
  query.addEventListener('change', preference);
  document.addEventListener('visibilitychange', preference);
  return () => { visibility.disconnect(); changes.disconnect(); controls.disconnect(); records.forEach(settle); query.removeEventListener('change', preference); document.removeEventListener('visibilitychange', preference); };
 }, []);
 return null;
}
