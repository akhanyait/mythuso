import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Card, type CardProps } from './Card';
import { cx } from './cx';

/* One figure a screen is opened for, with its label and an optional trend. The value is the metric size
   of the type scale (32), not the handoff's 30, which the scale does not have.

   The trend is the handoff's success colour only where that colour can carry words: on a light ground
   the handoff's green measures 3.64:1 on white and clears the 3:1 floor for a mark but not 4.5:1 for text,
   so there it is drawn in the teal ink the build already measures for "a value in range", and on a dark
   ground in the handoff's own green, which reads. The trend's words say which way it went; the colour
   never has to. */
export interface MetricCardProps extends Omit<CardProps, 'title'> {
 label: string;
 value: string;
 trend?: string;
 icon?: ReactNode;
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(({ label, value, trend, icon, className, ...props }, ref) =>
 <Card ref={ref} padding="md" className={cx('ui-metric', className)} {...props}>
  <div className="ui-metric__head"><span className="ui-metric__label">{label}</span>{icon}</div>
  <p className="ui-metric__value">{value}</p>
  {trend && <p className="ui-metric__trend">{trend}</p>}
 </Card>);
MetricCard.displayName = 'MetricCard';
