import { Modal } from '../components/UI';
import { RolePanel } from './DemoLogin';
import './LoginPanel.css';

export default function LoginPanel({ onClose }: { onClose: () => void }) {
 return <Modal title="Log in to MyThuso" onClose={onClose} surface="central-login">
  <p className="muted">Choose your role to open its dashboard. Preview auto-login uses fictional profiles.</p>
  <RolePanel onPick={role => window.location.assign(`/?role=${role}`)}/>
 </Modal>;
}
