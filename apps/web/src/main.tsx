import { createRoot } from 'react-dom/client';
import Workspace from './Workspace';

// Compatibility entry for existing /app/ bookmarks. New entry links use the main site.
createRoot(document.getElementById('root')!).render(<Workspace/>);
