import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

/* The switch between the light default and the dark option, built exactly as the pause control beside
 * it is: a real <button>, in the tab order, whose name says what the press will do. The visible text
 * is the accessible name, so what is said matches what is shown. It wears the pause control's own
 * classes so the two read as one row of page controls wherever they sit. */
export function ThemeToggle({ className }: { className?: string }) {
 const { dark, toggle } = useTheme();
 return (
  <button type="button" className={`m-theme m-press${className ? ` ${className}` : ''}`} onClick={toggle}>
   {dark ? <Sun size={15}/> : <Moon size={15}/>}
   <span>{dark ? 'Light theme' : 'Dark theme'}</span>
  </button>
 );
}
