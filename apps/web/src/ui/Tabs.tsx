import { Children, cloneElement, forwardRef, isValidElement } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, ReactElement } from 'react';
import { cx } from './cx';
import './ui.css';

/* Peer views of one thing, switched without leaving the page. The handoff's TabsList and Tab, with the
   keyboard the tabs pattern expects and the handoff leaves out: one Tab stop for the whole list (the
   selected tab, or the first when none is), and the arrow keys, Home and End to move between tabs, which
   selects the one arrived at — the same behaviour the Control Tower's category tabs already have.

   A tab says it is selected in aria-selected, always "true" or "false", and on screen by its raised face
   and shadow as well as its colour. Each tab is 36 tall inside the list's 4-pixel inset, and its hit area
   reaches the list's edges, so the target is the list's full 44. */
export const TabsList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, children, onKeyDown, ...props }, ref) => {
 const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<TabProps>[];
 const noneSelected = !tabs.some(tab => tab.props.active);
 let first = true;
 const items = Children.map(children, child => {
  if (!isValidElement(child) || !noneSelected || !first) return child;
  first = false;
  return cloneElement(child as ReactElement<TabProps>, { tabIndex: (child as ReactElement<TabProps>).props.tabIndex ?? 0 });
 });
 const move = (event: KeyboardEvent<HTMLDivElement>) => {
  onKeyDown?.(event);
  if (event.defaultPrevented) return;
  const all = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  const next = event.key === 'ArrowRight' ? all[(at + 1) % all.length]
   : event.key === 'ArrowLeft' ? all[(at - 1 + all.length) % all.length]
   : event.key === 'Home' ? all[0]
   : event.key === 'End' ? all[all.length - 1] : null;
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.click();
 };
 return <div ref={ref} role="tablist" className={cx('ui-tabs', className)} onKeyDown={move} {...props}>{items}</div>;
});
TabsList.displayName = 'TabsList';

export interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> { active?: boolean }

export const Tab = forwardRef<HTMLButtonElement, TabProps>(({ active = false, className, children, tabIndex, ...props }, ref) =>
 <button ref={ref} type="button" role="tab" aria-selected={active} tabIndex={tabIndex ?? (active ? 0 : -1)}
  className={cx('ui-tab', active && 'ui-tab--active', className)} {...props}>{children}</button>);
Tab.displayName = 'Tab';
