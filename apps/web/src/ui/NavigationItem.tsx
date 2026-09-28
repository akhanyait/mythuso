import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from './cx';
import './ui.css';

/* A destination in a navigation rail. The current one carries aria-current="page", and on screen the
   handoff's aqua tint, its words in the ink colour, and a heavier weight — so it is never told apart by
   colour alone. 44 tall rather than the handoff's 40. A count, when there is one, replaces the chevron;
   the count is text, so it is announced with the destination's name. */
export interface NavigationItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
 icon?: ReactNode;
 active?: boolean;
 count?: number;
}

export const NavigationItem = forwardRef<HTMLButtonElement, NavigationItemProps>(({ icon, active, count, className, children, ...props }, ref) =>
 <button ref={ref} type="button" aria-current={active ? 'page' : undefined} className={cx('ui-nav-item', active && 'ui-nav-item--active', className)} {...props}>
  {icon}
  <span className="ui-nav-item__label">{children}</span>
  {typeof count === 'number' ? <span className="ui-nav-item__count">{count}</span> : <ChevronRight aria-hidden="true" className="ui-nav-item__chevron"/>}
 </button>);
NavigationItem.displayName = 'NavigationItem';
