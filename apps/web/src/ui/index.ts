/* The shared components — the design handoff of 28 September 2026's component library, rebuilt on plain
   CSS classes that read the token variables and nothing else (ui.css). Names, props, variants and sizes
   are the handoff's, so a screen written against its catalogue (docs/component-catalog.json in
   packages/brand/lovable-handoff) reads the same here; where one of them had to differ for a rule of this
   build, the component's own file says which and why.

   Nothing on the patient's first view imports this yet. Until a screen does, it arrives only behind a
   dynamic import — the development gallery at ?open=ui, and the portal's fields — so neither entry pays
   for it. The icon family is re-exported so the catalogue's MyThuso icons are reached from the same place. */
export { Button, buttonVariants, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';
export { Card, CardContent, CardDescription, CardHeader, CardTitle, type CardPadding, type CardProps, type CardVariant } from './Card';
export { MetricCard, type MetricCardProps } from './MetricCard';
export { Input, type InputProps } from './Input';
export { Textarea, type TextareaProps } from './Textarea';
export { Select, type SelectProps } from './Select';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Field, type FieldProps } from './Field';
export { Alert, type AlertProps, type AlertVariant } from './Alert';
export { Badge, badgeVariants, type BadgeProps, type BadgeSize, type BadgeVariant } from './Badge';
export { StatusIndicator, type Status, type StatusIndicatorProps } from './StatusIndicator';
export { Tab, TabsList, type TabProps } from './Tabs';
export { NavigationItem, type NavigationItemProps } from './NavigationItem';
export { Avatar, AvatarFallback, AvatarImage, type AvatarFallbackProps, type AvatarProps } from './Avatar';
export { Divider, type DividerProps } from './Divider';
export { Spinner, type SpinnerProps, type SpinnerSize, type SpinnerTone } from './Spinner';
export * from './icons/MyThusoIcons.generated';
