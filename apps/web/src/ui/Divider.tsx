import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './ui.css';

/* A rule between two groups, used sparingly: spacing is usually the better separator. It is an <hr>, so
   it is a separator to assistive technology, with its orientation said. */
export interface DividerProps extends HTMLAttributes<HTMLHRElement> { orientation?: 'horizontal' | 'vertical' }

export const Divider = forwardRef<HTMLHRElement, DividerProps>(({ orientation = 'horizontal', className, ...props }, ref) =>
 <hr ref={ref} aria-orientation={orientation} className={cx('ui-divider', `ui-divider--${orientation}`, className)} {...props}/>);
Divider.displayName = 'Divider';
